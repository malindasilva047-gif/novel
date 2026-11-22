# Novel Frontier (Next.js + FastAPI + MongoDB Atlas)

This project implements your novel reading and writing platform using:

- Frontend: Next.js (App Router) + normal CSS (highly animated, colorful UI)
- Backend: FastAPI
- Database: MongoDB Atlas

## Project Structure

```text
project_003/
  frontend/
    app/
      globals.css
      layout.js
      page.js
    lib/
      mockData.js
    .env.example
    jsconfig.json
    next.config.js
    package.json
  backend/
    app/
      api/v1/endpoints/
        admin.py
        auth.py
        discovery.py
        engagement.py
        stories.py
        users.py
      api/v1/router.py
      core/
        config.py
        security.py
      db/
        deps.py
        mongodb.py
      schemas/
        auth.py
        story.py
      main.py
    .env.example
    requirements.txt
  .gitignore
  README.md
```

## Requirement Coverage (from your document)

Implemented now:

- User system: signup, login, email verification, password reset, profile fetch/update, profile image URL, bio, follow/unfollow users
- Writer features: create/edit/delete story, draft save/publish, chapter create/edit/delete, cover image upload endpoint, tags/categories, story description
- Reader features: read stories, chapter navigation display, bookmark toggle/list, like/react, comment system, follow writers, reading history
- Discovery features: homepage feed, trending, latest, categories endpoint, search, popularity filter endpoint
- Badge system: early writer, first story, five stories, top writer, verified writer, active reader
- Admin panel: analytics dashboard, user management list, ban/unban users, report list/resolve, story and comment moderation
- Ads system UI: homepage ad section, between-list ad section, end-of-chapter ad section, no popup/no auto video ads
- Database structure: users, stories, chapters, comments, likes, followers, badges, views, reports, bookmarks, reading_history
- Security: password hashing, email verification, anti-spam duplicate comment protection, IP rate limiting
- Performance: image optimization, lazy loading via Next Image, short TTL cache for discovery endpoints

## Step-by-Step Setup (Local)

## 1. Clone and open

```powershell
git clone <your-repo-url>
cd project_003
```

## 2. Setup Backend (FastAPI)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Update backend .env:

- MONGODB_URI = your Atlas connection string
- MONGODB_DB_NAME = your database name
- JWT_SECRET_KEY = long random string
- CORS_ORIGINS = frontend URL(s)
- RATE_LIMIT_REQUESTS = requests allowed per window (default 120)
- RATE_LIMIT_WINDOW_SECONDS = window size in seconds (default 60)
- DISCOVERY_CACHE_TTL_SECONDS = cache TTL for discovery endpoints (default 30)
- UPLOAD_DIR = server directory for uploaded cover images (default uploads)
- PUBLIC_BACKEND_BASE_URL = backend base URL for building upload URLs (default http://localhost:8000)
- ADMIN_BOOTSTRAP_KEY = one-time protected key for promoting initial admin user via auth bootstrap endpoint
- DEFAULT_ADMIN_USERNAME = startup-seeded admin username (default admin)
- DEFAULT_ADMIN_EMAIL = startup-seeded admin email (default admin@example.com)
- DEFAULT_ADMIN_PASSWORD = startup-seeded admin password (default admin)

Run backend:

```powershell
uvicorn app.main:app --reload --port 8000
```

Health check:

- GET http://localhost:8000/health
- Demo admin login: username `admin` and password `admin`

## 3. Setup Frontend (Next.js)

Open new terminal:

```powershell
cd frontend
npm install
copy .env.example .env.local
```

Update frontend .env.local:

- NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1

Run frontend:

```powershell
npm run dev
```

Open:

- http://localhost:3000

## 4. MongoDB Atlas Setup

1. Create free cluster (M0) in MongoDB Atlas.
2. Create database user.
3. Add IP access (0.0.0.0/0 for testing, restrict later).
4. Copy SRV string and set MONGODB_URI in backend .env.
5. Start backend and test /health and auth endpoints.

## 5. API Quick Test Flow

1. POST /api/v1/auth/signup
2. POST /api/v1/auth/login
3. Use Bearer token for protected routes:
   - POST /api/v1/stories
   - POST /api/v1/stories/{story_id}/chapters
   - POST /api/v1/engagement/stories/{story_id}/like

## 6. Free Hosting Plan

Recommended free stack:

- Frontend: Vercel (free)
- Backend: Render or Railway free tier
- Database: MongoDB Atlas free tier

### Frontend deployment (Vercel)

1. Import frontend folder as project.
2. Build command: npm run build
3. Output: default Next.js
4. Environment variable:
   - NEXT_PUBLIC_API_BASE_URL=https://your-backend-domain/api/v1

### Backend deployment (Render)

1. Create new Web Service from backend folder.
2. Start command:
   - uvicorn app.main:app --host 0.0.0.0 --port 10000
3. Add environment variables from backend .env.example.
4. Set CORS_ORIGINS to your Vercel domain.

## 7. Suggested Next Improvements

- Add Redis cache for feed/trending endpoints
- Add Cloudinary for cover uploads
- Add background tasks for badge updates
- Add rate-limiting middleware
- Add tests (Pytest + Playwright)

## Notes on UI and Images

- Frontend uses online images from Unsplash for story cards.
- UI is intentionally colorful and animation-rich with multiple keyframes.
- Layout is responsive for mobile, tablet, and desktop.
