import 'dotenv/config';
import express from 'express';
import { MongoClient } from 'mongodb';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 4178;
const host = process.env.HOST || '127.0.0.1';
const databaseName = process.env.MONGODB_DATABASE || 'your-idea-builder';
const mongoUri = process.env.MONGODB_URI;
const dashboardUser = process.env.DASHBOARD_USER;
const dashboardPassword = process.env.DASHBOARD_PASSWORD;
const here = path.dirname(fileURLToPath(import.meta.url));

if (!mongoUri) throw new Error('MONGODB_URI is required in .env');
if (!dashboardUser || !dashboardPassword) throw new Error('DASHBOARD_USER and DASHBOARD_PASSWORD are required in .env');

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 8000 });
await client.connect();
const db = client.db(databaseName);

function matchesSecret(candidate, expected) {
  const actualBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

app.use((req, res, next) => {
  const authorization = req.headers.authorization || '';
  const [scheme, encoded] = authorization.split(' ');
  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator >= 0 && matchesSecret(decoded.slice(0, separator), dashboardUser) && matchesSecret(decoded.slice(separator + 1), dashboardPassword)) {
        return next();
      }
    } catch {
      // Invalid credentials fall through to the same challenge as missing credentials.
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="E-learning sales dashboard", charset="UTF-8"');
  return res.status(401).send('Authentication required');
});

app.use(express.static(path.join(here, 'public')));

const vietnamOffsetMs = 7 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

function vietnamDateString(date) {
  const localDate = new Date(date.getTime() + vietnamOffsetMs);
  return `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, '0')}-${String(localDate.getUTCDate()).padStart(2, '0')}`;
}

function parseVietnamDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (utcDate.getUTCFullYear() !== year || utcDate.getUTCMonth() !== month - 1 || utcDate.getUTCDate() !== day) return null;
  return new Date(utcDate.getTime() - vietnamOffsetMs);
}

function resolveDateRange(range, query) {
  const now = new Date();
  if (range === 'all') return { start: null, end: null };
  if (range === 'custom') {
    const start = parseVietnamDate(query.startDate);
    const inclusiveEnd = parseVietnamDate(query.endDate);
    if (!start || !inclusiveEnd) throw new Error('Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.');
    if (start > inclusiveEnd) throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    return { start, end: new Date(inclusiveEnd.getTime() + dayMs) };
  }
  if (range === 'today' || range === 'yesterday') {
    const todayStart = parseVietnamDate(vietnamDateString(now));
    const start = range === 'today' ? todayStart : new Date(todayStart.getTime() - dayMs);
    return { start, end: new Date(start.getTime() + dayMs) };
  }
  if (range === 'year') {
    const year = Number(vietnamDateString(now).slice(0, 4));
    return { start: parseVietnamDate(`${year}-01-01`), end: now };
  }
  const days = range === '30d' ? 30 : 90;
  const todayStart = parseVietnamDate(vietnamDateString(now));
  return {
    start: new Date(todayStart.getTime() - (days - 1) * dayMs),
    end: new Date(todayStart.getTime() + dayMs),
  };
}

function comparisonStart(range, start, end) {
  if (!start) return null;
  if (range === 'year') {
    const previousYear = Number(vietnamDateString(start).slice(0, 4)) - 1;
    return parseVietnamDate(`${previousYear}-01-01`);
  }
  return new Date(start.getTime() - (end.getTime() - start.getTime()));
}

app.get('/api/dashboard', async (req, res) => {
  try {
    const requestedRange = typeof req.query.range === 'string' ? req.query.range : 'all';
    const range = ['today', 'yesterday', 'custom', '30d', '90d', 'year', 'all'].includes(requestedRange)
      ? requestedRange
      : 'all';
    let dateRange;
    try {
      dateRange = resolveDateRange(range, req.query);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const { start, end } = dateRange;
    const match = { status: 'approved' };
    const pendingMatch = { status: 'pending' };
    const previousStart = comparisonStart(range, start, end);
    const previousMatch = previousStart
      ? { status: 'approved', createdAt: { $gte: previousStart, $lt: start } }
      : null;
    if (start) {
      match.createdAt = { $gte: start, $lt: end };
      pendingMatch.createdAt = { $gte: start, $lt: end };
    }

    const [summaryRows, previousSummaryRows, pendingCount, byCourse, courseSales, courses, trend, latest] = await Promise.all([
      db.collection('course_enrollments').aggregate([
        { $match: match },
        { $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
          units: { $sum: { $size: { $ifNull: ['$courseSnapshots', []] } } },
          firstOrder: { $min: '$createdAt' },
        } },
      ]).toArray(),
      previousMatch
        ? db.collection('course_enrollments').aggregate([
          { $match: previousMatch },
          { $group: {
            _id: null,
            orders: { $sum: 1 },
            revenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
            units: { $sum: { $size: { $ifNull: ['$courseSnapshots', []] } } },
          } },
        ]).toArray()
        : Promise.resolve([]),
      db.collection('course_enrollments').countDocuments(pendingMatch),
      db.collection('course_enrollments').aggregate([
        { $match: match },
        { $unwind: { path: '$courseSnapshots', preserveNullAndEmptyArrays: false } },
        { $group: {
          _id: { $ifNull: ['$courseSnapshots.title', 'Khóa học chưa đặt tên'] },
          sold: { $sum: 1 },
          listedRevenue: { $sum: { $ifNull: ['$courseSnapshots.price', 0] } },
        } },
        { $sort: { sold: -1, _id: 1 } },
      ]).toArray(),
      db.collection('course_enrollments').aggregate([
        { $match: match },
        { $unwind: { path: '$courseSnapshots', preserveNullAndEmptyArrays: false } },
        { $group: {
          _id: {
            $ifNull: [
              { $toString: '$courseSnapshots.course' },
              { $concat: ['title:', { $ifNull: ['$courseSnapshots.title', 'Khóa học chưa đặt tên'] }] },
            ],
          },
          sold: { $sum: 1 },
          snapshotRevenue: { $sum: { $ifNull: ['$courseSnapshots.price', 0] } },
        } },
      ]).toArray(),
      db.collection('courses').find({}, {
        projection: { title: 1, category: 1, price: 1, status: 1, createdAt: 1, updatedAt: 1 },
      }).sort({ title: 1 }).toArray(),
      db.collection('course_enrollments').aggregate([
        { $match: match },
        { $match: { createdAt: { $type: 'date' } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: 'Asia/Ho_Chi_Minh' } },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
          units: { $sum: { $size: { $ifNull: ['$courseSnapshots', []] } } },
        } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      db.collection('course_enrollments').find(match, {
        projection: { createdAt: 1, totalAmount: 1, courseSnapshots: 1, _id: 0 },
      }).sort({ createdAt: -1 }).limit(6).toArray(),
    ]);

    const summary = summaryRows[0] || { orders: 0, revenue: 0, units: 0, firstOrder: null };
    const previousSummary = previousSummaryRows[0] || { orders: 0, revenue: 0, units: 0 };
    const salesByCourse = new Map(courseSales.map((item) => [item._id, item]));
    const displayedEnd = ['today', 'yesterday', '30d', '90d', 'custom'].includes(range)
      ? new Date(end.getTime() - 1)
      : end;
    res.json({
      range,
      dateRange: start ? { start: vietnamDateString(start), end: vietnamDateString(displayedEnd) } : null,
      summary: {
        orders: summary.orders,
        revenue: summary.revenue,
        units: summary.units,
        pendingOrders: pendingCount,
        averageOrder: summary.orders ? Math.round(summary.revenue / summary.orders) : 0,
        firstOrder: summary.firstOrder || null,
        comparison: previousMatch ? {
          revenue: previousSummary.revenue,
          orders: previousSummary.orders,
          units: previousSummary.units,
        } : null,
      },
      byCourse: byCourse.map((item) => ({ name: item._id, sold: item.sold, listedRevenue: item.listedRevenue })),
      courses: courses.map((course) => {
        const id = course._id.toString();
        const sales = salesByCourse.get(id) || salesByCourse.get(`title:${course.title || 'Khóa học chưa đặt tên'}`);
        return {
          id,
          name: course.title || 'Khóa học chưa đặt tên',
          category: course.category || 'Chưa phân loại',
          price: course.price || 0,
          status: course.status || 'unknown',
          createdAt: course.createdAt || null,
          updatedAt: course.updatedAt || null,
          sold: sales?.sold || 0,
          snapshotRevenue: sales?.snapshotRevenue || 0,
        };
      }),
      trend: trend.map((item) => ({ month: item._id, orders: item.orders, revenue: item.revenue, units: item.units })),
      latest: latest.map((item) => ({
        date: item.createdAt,
        amount: item.totalAmount || 0,
        courses: (item.courseSnapshots || []).map((course) => course.title || 'Khóa học chưa đặt tên'),
      })),
    });
  } catch (error) {
    console.error('Dashboard query failed:', error.message);
    res.status(500).json({ error: 'Không thể tải dữ liệu dashboard.' });
  }
});

app.listen(port, host, () => {
  console.log(`E-learning dashboard: http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await client.close();
    process.exit(0);
  });
}