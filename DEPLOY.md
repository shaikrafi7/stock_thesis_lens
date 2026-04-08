# Fly.io Deployment

## Prerequisites
- Install flyctl: https://fly.io/docs/hands-on/install-flyctl/
- Login: `flyctl auth login`

## First-time setup

### 1. Deploy the backend API

```bash
cd backend
flyctl apps create thesisarc-api
flyctl volumes create thesisarc_data --region iad --size 1
flyctl secrets set \
  OPENAI_API_KEY="your-key" \
  POLYGON_API_KEY="your-key" \
  SECRET_KEY="$(openssl rand -hex 32)" \
  CORS_ORIGINS="https://thesisarc-web.fly.dev,http://localhost:3000"
flyctl deploy
```

### 2. Deploy the frontend

```bash
cd ../frontend
flyctl apps create thesisarc-web
flyctl deploy
```

## Subsequent deploys

```bash
# Backend
cd backend && flyctl deploy

# Frontend
cd frontend && flyctl deploy
```

## Useful commands

```bash
flyctl logs --app thesisarc-api     # backend logs
flyctl logs --app thesisarc-web     # frontend logs
flyctl ssh console --app thesisarc-api   # SSH into backend
flyctl status --app thesisarc-api   # check status
```

## Notes
- Database is SQLite stored in a Fly volume at `/data/stock_thesis.db`
- The volume persists across deploys and restarts
- Backend URL: https://thesisarc-api.fly.dev
- Frontend URL: https://thesisarc-web.fly.dev
- If you rename apps, update `NEXT_PUBLIC_API_URL` in `frontend/fly.toml` and `CORS_ORIGINS` secret
