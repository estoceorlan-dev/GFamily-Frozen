# GFamily Frozen Products

A full-stack sales, inventory, and store management system for frozen-product retailers. GFamily combines role-based workspaces, point-of-sale transactions, stock receiving, reusable product categories and units, reporting, and staff administration in one responsive web application.

[Open the live application](https://gfamily-frozen.vercel.app) · [Check API health](https://gfamily-frozen.vercel.app/api/health) · [View the repository](https://github.com/estoceorlan-dev/GFamily-Frozen)

> The Render free web service can sleep after inactivity. The first request may take several seconds while the service wakes up.

## Features

- Automatic role detection at sign-in and redirects to the correct workspace.
- Owner / Manager dashboard for products, inventory, suppliers, customers, staff, reports, and sales oversight.
- Cashier workspace with cart-based checkout, customer records, sales history, CSV export, and printable receipts.
- Store Clerk workspace for stock receiving, supplier lookup, inventory monitoring, and receipt history.
- Reusable product category and unit lists with dropdown selection in product forms.
- Fractional quantities, centavo-safe calculations, stock thresholds, and archived-product history.
- Transaction-safe checkout with row locking, duplicate-request protection, and overselling prevention.
- Sale voiding with a required reason, one-time stock restoration, and corrected revenue totals.
- Server-enforced permissions, HttpOnly sessions, rate-limited authentication, password hashing, and session revocation.
- Responsive Tailwind CSS interface with accessible dialogs, sign-out confirmation, and mobile navigation.

## User roles

| Role | Main access |
| --- | --- |
| Owner / Manager | Dashboard, catalog, categories, units, inventory, contacts, staff, reports, exports, and sale voiding |
| Cashier | Checkout, customers, personal sales history, receipts, and sales export |
| Store Clerk | Inventory, suppliers, stock receiving, receipt history, and inventory export |

Roles are stored with each account. Users enter only their username and password; the API identifies the role and the frontend opens the correct dashboard automatically.

## Technology

| Layer | Technology |
| --- | --- |
| Frontend | HTML, vanilla JavaScript, Tailwind CSS 4, self-hosted Inter font |
| API | Node.js 24, Express 5 |
| Database | PostgreSQL with versioned SQL migrations |
| Authentication | Password hashing, database-backed HttpOnly sessions, role-based authorization |
| Frontend hosting | Vercel |
| API hosting | Render |
| Production database | Neon PostgreSQL |
| Testing | Node test runner, JSDOM, PostgreSQL integration tests |

```mermaid
flowchart LR
    Browser[Browser] --> Vercel[Vercel frontend]
    Vercel -->|/api rewrite| Render[Render Express API]
    Render --> Neon[(Neon PostgreSQL)]
```

## Local setup

### Requirements

- Node.js 24
- PostgreSQL 16 or newer, or a Neon PostgreSQL project

### Installation

```powershell
git clone https://github.com/estoceorlan-dev/GFamily-Frozen.git
Set-Location GFamily-Frozen
npm ci
Copy-Item .env.example .env
```

Update `.env` with a PostgreSQL connection string. Use `DATABASE_SSL=true` for Neon and `DATABASE_SSL=false` for a local PostgreSQL server.

```powershell
npm run dev
```

Open [http://localhost:8790](http://localhost:8790). Choose **Set up store** to create the first Owner / Manager account. If `OWNER_SETUP_TOKEN` is configured, enter it during first-owner setup.

The server applies pending migrations before accepting requests. Existing records are preserved, and each migration runs only once.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL |
| `DATABASE_SSL` | Enables verified TLS for hosted PostgreSQL |
| `DB_POOL_SIZE` | Maximum database pool size; defaults to `5` |
| `FRONTEND_URL` | Allowed frontend origin for state-changing requests |
| `OWNER_SETUP_TOKEN` | Secret used only when creating the first owner account |
| `HOST` | API bind address; defaults to `0.0.0.0` |
| `PORT` | Local or hosting-platform port |
| `BACKEND_URL` | Render API origin used by the Vercel rewrite configuration |

Never commit `.env`, database credentials, owner setup tokens, backups, or test databases.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build assets and start the development server in watch mode |
| `npm run build` | Compile Tailwind CSS and create the `dist` frontend |
| `npm test` | Run API and browser behavior tests |
| `npm run test:integration` | Run PostgreSQL HTTP integration tests |
| `npm run check` | Run the standard test suite and production build |
| `npm run db:migrate` | Apply pending PostgreSQL migrations |
| `npm run db:seed:demo` | Insert disposable local demonstration data |
| `npm run db:backup` | Create a PostgreSQL backup using `pg_dump` |

For integration testing, provide a local test database:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:your_password@127.0.0.1:5432/gfamily_test'
npm run test:integration
```

The integration suite creates and removes an isolated PostgreSQL schema. It verifies migrations, account setup, permissions, catalog options, concurrent checkout, fractional pricing, receipt snapshots, voiding, staff revocation, password changes, session expiry, and logout.

## Project structure

```text
admindashboard.html        Owner / Manager interface and sign-in
casher.html                Cashier interface
clerk.html                 Store Clerk interface
project.js                 Shared frontend behavior
styles/app.css             Tailwind source styles
functions/api/[[path]].js  API routes and business rules
server.js                  Express adapter and production server
database.js                PostgreSQL adapter, pool, and migration runner
postgres-migrations/       Production PostgreSQL migrations
tests/                     API, browser, deployment, and database tests
render.yaml                Render Blueprint configuration
vercel.mjs                 Vercel build and API rewrite configuration
```

## Deployment

The production flow is Vercel → Render → Neon PostgreSQL. Vercel serves the compiled frontend and proxies same-origin `/api/*` requests to Render. Render starts the Express service, applies pending PostgreSQL migrations, and connects to Neon using verified TLS.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the complete setup, environment configuration, first-owner activation, verification, and backup workflow.

The repository also retains earlier MySQL and SQLite/D1 files as migration references. The supported production deployment uses the files in `postgres-migrations/`.
