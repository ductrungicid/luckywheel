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

## 3. Bật lưu cài đặt dùng chung bằng Supabase

Chạy SQL này trong Supabase SQL Editor:

```sql
create table if not exists public.app_settings (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

Thêm 2 biến môi trường trên Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Sau đó redeploy project. `api/settings.py` sẽ đọc/ghi cấu hình dùng chung trên bảng `public.app_settings`.

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

Nếu không có Supabase env vars, app local sẽ lưu vào `data/settings.json`.
