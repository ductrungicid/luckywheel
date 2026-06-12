# Vòng Quay May Mắn

## Chạy local

```bash
python app.py
```

Mở:

```txt
http://127.0.0.1:8000/play
http://127.0.0.1:8000/settings
```

## Deploy nhanh lên Vercel

```bash
git init
git add .
git commit -m "Prepare lucky wheel for Vercel"
git branch -M main
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

Sau đó:

1. Đăng nhập [Vercel](https://vercel.com/)
2. `Add New Project`
3. Chọn repo GitHub
4. Framework Preset: `Other`
5. Deploy

## Lưu cài đặt dùng chung trên web

Trong Vercel Marketplace, gắn một Redis integration vào project.

App hỗ trợ các biến môi trường:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Nếu có Redis env vars, cấu hình sẽ lưu dùng chung trên web.
Nếu không có, app local sẽ lưu vào `data/settings.json`.
