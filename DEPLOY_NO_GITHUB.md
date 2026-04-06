# No-GitHub Deployment Guide

This project can be deployed without GitHub, but the cleanest split is:

- Frontend: Vercel CLI from your terminal
- Database: MongoDB Atlas free tier
- Backend: Render is easiest overall, but typically expects a git-connected source

If you want strictly no GitHub for everything, deploy the frontend first and prepare the backend environment. For the backend, you will likely need either:

- a platform that accepts direct uploads/CLI deploys, or
- a Git provider later for the easiest free hosting path

## 1. Before You Deploy

Rotate these values before going public:

- backend JWT secret
- admin bootstrap key
- SMTP password/app password
- default admin credentials

## 2. Frontend Deploy From Terminal With Vercel CLI

Install CLI:

```powershell
npm install -g vercel
```

From the project root:

```powershell
cd frontend
copy .env.example .env.production.local
```

Set production values in `frontend/.env.production.local`:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain.onrender.com
NEXT_PUBLIC_APP_NAME=Bixbi
NEXT_PUBLIC_SITE_URL=https://your-frontend-domain.vercel.app
```

Login and deploy:

```powershell
vercel login
vercel
```

When prompted:

- scope: choose your Vercel account
- link to existing project: No
- project name: bixbi-frontend
- directory: ./
- override settings: No

For production deploy:

```powershell
vercel --prod
```

## 3. MongoDB Atlas Free Database

1. Create a free cluster.
2. Create a database user.
3. Add network access rule `0.0.0.0/0` for setup.
4. Copy the SRV string.
5. Use that in backend env:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster-url/?retryWrites=true&w=majority
MONGODB_DB_NAME=novel_platform
```

## 4. Backend Variables You Will Need Anywhere

Use values based on `backend/.env.example`:

```env
PROJECT_NAME=Novel Reading and Writing Platform API
API_V1_PREFIX=/api/v1
MONGODB_URI=...
MONGODB_DB_NAME=novel_platform
JWT_SECRET_KEY=replace-with-strong-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
CORS_ORIGINS=https://your-frontend-domain.vercel.app
RATE_LIMIT_REQUESTS=120
RATE_LIMIT_WINDOW_SECONDS=60
DISCOVERY_CACHE_TTL_SECONDS=30
UPLOAD_DIR=uploads
PUBLIC_BACKEND_BASE_URL=https://your-backend-domain.onrender.com
ADMIN_BOOTSTRAP_KEY=replace-with-strong-random-admin-key
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=replace-this-admin-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@example.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=your-email@example.com
SMTP_FROM_NAME=Bixbi
SMTP_USE_TLS=true
```

## 5. Render Backend Notes

Render is still one of the easiest free backend hosts for this app, but it usually works best with a connected repository.

Backend settings if you use Render later:

- Root Directory: `backend`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## 6. Production Validation Checklist

1. Frontend homepage opens.
2. `robots.txt` works.
3. `sitemap.xml` works.
4. Backend `/health` returns ok.
5. Admin login only works for admin users.
6. CORS allows only your production frontend domain.
7. Create a new strong admin account and remove default credentials.
