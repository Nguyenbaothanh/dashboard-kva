# E-learning Sales Dashboard

Dashboard quản trị bán hàng khóa học, đọc danh mục từ collection `courses` và dữ liệu đơn hàng từ `course_enrollments` trong MongoDB.

Dashboard hiển thị toàn bộ khóa học trong danh mục, kể cả khóa chưa có lượt bán. Có thể tìm theo tên/danh mục, lọc trạng thái và sắp xếp theo giá trị ghi nhận, lượt bán, ngày cập nhật hoặc tên khóa học. Bộ lọc thời gian hỗ trợ hôm nay, hôm qua, 30 ngày, 90 ngày, năm nay, toàn bộ dữ liệu và khoảng ngày tùy chỉnh. Mốc ngày được tính theo múi giờ `Asia/Ho_Chi_Minh`. Doanh thu và số đơn trên các chỉ số tổng quan chỉ tính enrollment đã duyệt; các khoảng thời gian hữu hạn có so sánh với kỳ liền trước.

## Chạy local

```powershell
cd E-learning
npm install
npm start
```

Mở <http://127.0.0.1:4178>. Ứng dụng cần Node.js 18 trở lên.

## Cập nhật bản Docker trên máy chủ

Compose production dùng image `owlgroup/e-learning-dashboard:latest` từ Docker Hub. Sau khi pull image mới, cần recreate container để chạy image vừa tải:

```powershell
docker compose -f docker-compose.server.yml pull e-learning-dashboard
docker compose -f docker-compose.server.yml up -d --force-recreate e-learning-dashboard
docker compose -f docker-compose.server.yml ps
```

Chạy các lệnh trong thư mục deploy có `docker-compose.server.yml` và `.env`. Nếu truy cập qua proxy, kiểm tra trang sau khi container chuyển sang trạng thái running.

## Cấu hình

Điền `MONGODB_URI` trong `.env`. `MONGODB_DATABASE` mặc định là `your-idea-builder`; `HOST` mặc định là `127.0.0.1` và `PORT` là `4178`.

## Quy ước số liệu

- Doanh thu và số khóa học đã bán chỉ tính enrollment có `status: "approved"`.
- Một lượt bán là một course snapshot trong enrollment đã duyệt.
- Bảng danh mục ghép lượt bán với khóa học bằng ID trong `courseSnapshots.course`; khóa chưa có lượt bán vẫn được hiển thị với số liệu bằng 0.
- “Giá trị ghi nhận” trong bảng khóa học là tổng giá lưu trên các course snapshot, không nhất thiết bằng tổng tiền đơn khi có giảm giá hoặc đơn gồm nhiều khóa.
- Enrollment `pending` được đếm riêng và không cộng vào doanh thu.
- Chế độ “Toàn bộ” không so sánh với kỳ trước; các khoảng thời gian hữu hạn so sánh với khoảng liền trước có cùng độ dài (hoặc cùng kỳ năm trước).
- Đơn gần đây không hiển thị email, tên, user ID, thông tin chuyển khoản hoặc chứng từ.

Server chỉ bind vào localhost theo mặc định. Để truy cập từ máy khác, hãy đặt sau reverse proxy có HTTPS và xác thực; không mở cổng ứng dụng hoặc MongoDB trực tiếp ra Internet.