# Deploy lên Vercel

## 1. Đưa code lên GitHub

```bash
git init
git add .
git commit -m "Prepare lucky wheel for Vercel"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## 2. Import repo vào Vercel

- Đăng nhập Vercel bằng GitHub
- Chọn `Add New Project`
- Chọn repo này
- Framework Preset: `Other`
- Root Directory: để mặc định là thư mục gốc repo
- Production Branch: `main`

## 3. Bật lưu cài đặt dùng chung

App này ưu tiên lưu cấu hình trong Redis REST nếu có các biến môi trường sau:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Nếu provider Redis của bạn dùng tên biến Upstash thay vì Vercel, app cũng hỗ trợ:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Trên Vercel:

1. Vào project
2. Mở `Marketplace`
3. Cài một Redis integration
4. Kết nối integration đó với project này
5. Redeploy

Sau khi các biến môi trường tồn tại, `api/settings.py` sẽ đọc/ghi cấu hình dùng chung trên web.

## 4. Link sử dụng

- Trang chơi: `/play`
- Trang cài đặt: `/settings`

Ví dụ:

```txt
https://your-project.vercel.app/play
https://your-project.vercel.app/settings
```

## 5. Chạy local

```bash
python app.py
```

Nếu không có Redis env vars, app local sẽ lưu vào `data/settings.json`.
