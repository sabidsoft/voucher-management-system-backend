# Voucher Management System Backend

## Setup (development)

Copy `.env.example` to `.env` and fill in the values, then:

```bash
npm install
npx prisma generate          # required: src/generated is not committed
npx prisma migrate dev       # applies migrations, creates new ones if the schema changed
npm run seed                 # creates the first admin from .env
npm run start:dev
```

## Deployment (production)

On a manual server:

```bash
npm install
npx prisma generate
npx prisma migrate deploy    # applies existing migrations only — never creates or resets
npm run build
npm run start:prod
```

### Railway

Set these in the service settings:

- **Build command** — `npm install && npx prisma generate && npm run build`
- **Start command** — `npm run start:prod`
- **Health check path** — `/api/v1`

Add these variables under **Variables**: `DATABASE_URL`, `DIRECT_URL`,
`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `FRONTEND_URL`, `COOKIE_SAME_SITE`, and
`NODE_ENV=production`. Railway provides `PORT` itself. Migrations are not
run automatically — after deploying a schema change, run
`npx prisma migrate deploy` against the production database.