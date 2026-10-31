const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('vi-VN');
const dateTime = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
let currentRange = 'all';
let chartResizeObserver;
let catalogCourses = [];

function formatMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return monthLabel.format(new Date(Date.UTC(year, month - 1, 1)));
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function vietnamToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function renderTrend(rows) {
  const container = document.getElementById('trend-chart');
  container.replaceChildren();
  if (!rows.length) {
    container.textContent = 'Chưa có doanh thu trong khoảng thời gian này.';
    container.classList.add('empty-cell');
    return;
  }
  container.classList.remove('empty-cell');

  const width = Math.max(360, container.clientWidth || 500);
  const height = 228;
  const padding = { top: 16, right: 12, bottom: 30, left: 66 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.map((row) => row.revenue), 1);
  const niceMax = Math.ceil(maxValue / 4 / 100000) * 100000 || 100000;
  const axisMax = Math.max(niceMax * 4, 1);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs, text = '') => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text) node.textContent = text;
    svg.append(node);
    return node;
  };
  const xAt = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth);
  const yAt = (value) => padding.top + plotHeight - (value / axisMax) * plotHeight;

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = (axisMax / 4) * tick;
    const y = yAt(value);
    add('line', { x1: padding.left, y1: y, x2: width - padding.right, y2: y, stroke: '#e9ede8', 'stroke-width': 1 });
    add('text', { x: padding.left - 9, y: y + 3, fill: '#89948d', 'font-size': 9, 'text-anchor': 'end', 'font-family': 'DM Mono, monospace' }, value === 0 ? '0' : `${(value / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`);
  }

  const points = rows.map((row, index) => `${xAt(index)},${yAt(row.revenue)}`).join(' ');
  if (rows.length > 1) {
    const areaPoints = `${xAt(0)},${padding.top + plotHeight} ${points} ${xAt(rows.length - 1)},${padding.top + plotHeight}`;
    add('polygon', { points: areaPoints, fill: '#dcece4', opacity: 0.68 });
    add('polyline', { points, fill: 'none', stroke: '#087b60', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  } else {
    add('line', { x1: padding.left, y1: padding.top + plotHeight, x2: width - padding.right, y2: padding.top + plotHeight, stroke: '#edf0eb', 'stroke-width': 1 });
  }

  rows.forEach((row, index) => {
    const x = xAt(index);
    const y = yAt(row.revenue);
    add('circle', { cx: x, cy: y, r: 4, fill: '#fff', stroke: '#087b60', 'stroke-width': 2 });
    add('text', { x, y: height - 7, fill: '#78847c', 'font-size': 9, 'text-anchor': 'middle', 'font-family': 'DM Sans, sans-serif' }, formatMonth(row.month));
  });
  container.append(svg);
}

function renderCourses(rows) {
  const list = document.getElementById('course-list');
  list.replaceChildren();
  setText('course-count', `${integer.format(rows.length)} khóa`);
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'loading-cell';
    empty.textContent = 'Chưa có khóa học được bán trong kỳ này.';
    list.append(empty);
    return;
  }
  const max = Math.max(...rows.map((row) => row.sold), 1);
  rows.slice(0, 5).forEach((row, index) => {
    const item = document.createElement('div');
    item.className = 'course-row';
    const rank = document.createElement('span');
    rank.className = 'course-index';
    rank.textContent = String(index + 1).padStart(2, '0');
    const info = document.createElement('div');
    info.className = 'course-info';
    const name = document.createElement('div');
    name.className = 'course-name';
    name.title = row.name;
    name.textContent = row.name;
    const bar = document.createElement('div');
    bar.className = 'course-bar';
    const fill = document.createElement('span');
    fill.style.width = `${(row.sold / max) * 100}%`;
    bar.append(fill);
    info.append(name, bar);
    const sales = document.createElement('span');
    sales.className = 'course-sales';
    sales.textContent = integer.format(row.sold);
    const label = document.createElement('small');
    label.textContent = 'lượt bán';
    sales.append(label);
    item.append(rank, info, sales);
    list.append(item);
  });
}

function statusLabel(status) {
  const labels = {
    active: 'Đang bán',
    published: 'Đang bán',
    'in-progress': 'Đang triển khai',
    draft: 'Bản nháp',
    inactive: 'Đã ẩn',
    archived: 'Đã lưu trữ',
    'coming-soon': 'Sắp ra mắt',
    unknown: 'Chưa xác định',
  };
  return labels[status] || status;
}

function renderCatalog(rows = catalogCourses) {
  const body = document.getElementById('catalog-rows');
  const empty = document.getElementById('catalog-empty');
  body.replaceChildren();

  const query = document.getElementById('course-search').value.trim().toLocaleLowerCase('vi');
  const selectedStatus = document.getElementById('course-status-filter').value;
  const sortBy = document.getElementById('course-sort').value;
  const visibleCourses = rows
    .filter((course) => selectedStatus === 'all' || course.status === selectedStatus)
    .filter((course) => !query || `${course.name} ${course.category}`.toLocaleLowerCase('vi').includes(query))
    .sort((left, right) => {
      if (sortBy === 'sold') return right.sold - left.sold || left.name.localeCompare(right.name, 'vi');
      if (sortBy === 'updated') return new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0);
      if (sortBy === 'name') return left.name.localeCompare(right.name, 'vi');
      return right.snapshotRevenue - left.snapshotRevenue || left.name.localeCompare(right.name, 'vi');
    });

  setText('catalog-count', `${integer.format(visibleCourses.length)} / ${integer.format(rows.length)} khóa`);
  empty.hidden = visibleCourses.length > 0;
  if (!visibleCourses.length) return;

  visibleCourses.forEach((course) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = course.name;
    const category = document.createElement('td');
    category.textContent = course.category;
    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = `course-state${course.sold ? '' : ' course-state-empty'}`;
    status.textContent = statusLabel(course.status);
    statusCell.append(status);
    const price = document.createElement('td');
    price.className = 'align-right amount';
    price.textContent = money.format(course.price);
    const sold = document.createElement('td');
    sold.className = 'align-right';
    sold.textContent = integer.format(course.sold);
    if (!course.sold) sold.classList.add('no-sales');
    const revenue = document.createElement('td');
    revenue.className = 'align-right amount';
    revenue.textContent = money.format(course.snapshotRevenue);
    const updated = document.createElement('td');
    updated.textContent = course.updatedAt ? dateTime.format(new Date(course.updatedAt)) : '—';
    row.append(name, category, statusCell, price, sold, revenue, updated);
    body.append(row);
  });
}

function updateComparison(id, current, previous, comparisonAvailable) {
  const element = document.getElementById(id);
  element.classList.remove('change-positive', 'change-negative', 'change-neutral');
  if (!comparisonAvailable) {
    element.textContent = 'Tổng dữ liệu toàn thời gian';
    element.classList.add('change-neutral');
    return;
  }
  if (!previous) {
    element.textContent = current ? 'Mới phát sinh so với kỳ trước' : 'Không phát sinh trong hai kỳ';
    element.classList.add(current ? 'change-positive' : 'change-neutral');
    return;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  element.textContent = `${change > 0 ? '+' : ''}${integer.format(change)}% so với kỳ trước`;
  element.classList.add(change > 0 ? 'change-positive' : change < 0 ? 'change-negative' : 'change-neutral');
}

function renderOrders(rows) {
  const body = document.getElementById('recent-orders');
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'empty-cell';
    cell.textContent = 'Chưa có đơn hàng đã duyệt trong khoảng thời gian này.';
    row.append(cell);
    body.append(row);
    return;
  }
  rows.forEach((order) => {
    const row = document.createElement('tr');
    const courses = document.createElement('td');
    courses.textContent = order.courses.join(', ') || 'Khóa học';
    const date = document.createElement('td');
    date.textContent = order.date ? dateTime.format(new Date(order.date)) : '—';
    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = 'Đã duyệt';
    statusCell.append(status);
    const amount = document.createElement('td');
    amount.className = 'align-right amount';
    amount.textContent = money.format(order.amount);
    row.append(courses, date, statusCell, amount);
    body.append(row);
  });
}

async function loadDashboard(range = currentRange) {
  const params = new URLSearchParams({ range });
  if (range === 'custom') {
    const startDate = document.getElementById('date-start');
    const endDate = document.getElementById('date-end');
    startDate.setCustomValidity('');
    endDate.setCustomValidity('');
    if (!startDate.value || !endDate.value) {
      if (!startDate.value) startDate.setCustomValidity('Vui lòng chọn ngày bắt đầu.');
      if (!endDate.value) endDate.setCustomValidity('Vui lòng chọn ngày kết thúc.');
      (startDate.value ? endDate : startDate).reportValidity();
      return;
    }
    if (startDate.value > endDate.value) {
      endDate.setCustomValidity('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
      endDate.reportValidity();
      return;
    }
    params.set('startDate', startDate.value);
    params.set('endDate', endDate.value);
  }
  currentRange = range;
  const banner = document.getElementById('error-banner');
  banner.hidden = true;
  document.querySelectorAll('[data-range]').forEach((button) => {
    const selected = button.dataset.range === range;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const refresh = document.getElementById('refresh');
  refresh.disabled = true;
  try {
    const response = await fetch(`/api/dashboard?${params}`, { cache: 'no-store' });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Không thể kết nối đến dữ liệu MongoDB.');
    }
    const data = await response.json();
    setText('revenue', money.format(data.summary.revenue));
    setText('units', integer.format(data.summary.units));
    setText('orders', integer.format(data.summary.orders));
    setText('pending', integer.format(data.summary.pendingOrders));
    updateComparison('revenue-change', data.summary.revenue, data.summary.comparison?.revenue || 0, Boolean(data.summary.comparison));
    updateComparison('units-change', data.summary.units, data.summary.comparison?.units || 0, Boolean(data.summary.comparison));
    updateComparison('orders-change', data.summary.orders, data.summary.comparison?.orders || 0, Boolean(data.summary.comparison));
    renderTrend(data.trend);
    renderCourses(data.byCourse);
    catalogCourses = data.courses;
    const statusFilter = document.getElementById('course-status-filter');
    const selectedStatus = statusFilter.value;
    const statuses = [...new Set(catalogCourses.map((course) => course.status))].sort((a, b) => statusLabel(a).localeCompare(statusLabel(b), 'vi'));
    statusFilter.replaceChildren(new Option('Mọi trạng thái', 'all'));
    statuses.forEach((status) => statusFilter.add(new Option(statusLabel(status), status)));
    statusFilter.value = statuses.includes(selectedStatus) ? selectedStatus : 'all';
    renderCatalog();
    renderOrders(data.latest);
    setText('updated-at', `Cập nhật ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`);
    const rangeNames = {
      today: 'Hôm nay',
      yesterday: 'Hôm qua',
      '30d': '30 ngày gần nhất',
      '90d': '90 ngày gần nhất',
      year: 'Từ đầu năm',
      all: 'Toàn bộ dữ liệu',
    };
    const rangeLabel = range === 'custom'
      ? `${displayDate(data.dateRange.start)} – ${displayDate(data.dateRange.end)}`
      : rangeNames[range];
    setText('trend-caption', rangeLabel);
    setText('period-label', `${rangeLabel} · ${integer.format(data.summary.orders)} đơn được duyệt`);
  } catch (error) {
    banner.textContent = `${error.message} Kiểm tra cấu hình .env và trạng thái MongoDB.`;
    banner.hidden = false;
    setText('updated-at', 'Không thể cập nhật');
  } finally {
    refresh.disabled = false;
  }
}

document.querySelectorAll('[data-range]').forEach((button) => {
  button.addEventListener('click', () => loadDashboard(button.dataset.range));
});
document.getElementById('refresh').addEventListener('click', () => loadDashboard());
document.getElementById('custom-date-form').addEventListener('submit', (event) => {
  event.preventDefault();
  loadDashboard('custom');
});
document.getElementById('date-start').value = vietnamToday();
document.getElementById('date-end').value = vietnamToday();
document.getElementById('course-search').addEventListener('input', () => renderCatalog());
document.getElementById('course-status-filter').addEventListener('change', () => renderCatalog());
document.getElementById('course-sort').addEventListener('change', () => renderCatalog());
loadDashboard();

if ('ResizeObserver' in window) {
  chartResizeObserver = new ResizeObserver(() => loadDashboard());
  chartResizeObserver.observe(document.getElementById('trend-chart'));
}