# GFamily Frozen Products

A sales and inventory app with Owner / Manager, Cashier, and Store Clerk dashboards. The supported deployment is **Vercel (static frontend) → Render (Express API) → Neon PostgreSQL**. Node.js 24 is required.

The UI uses locally compiled Tailwind CSS and a self-hosted Inter variable font. Edit `styles/app.css` and the HTML/JavaScript utility classes, then run `npm run build`; `style.css` is generated. Build dependencies must be installed before building. Render installs them for the build and prunes them afterward.

## Local development

1. Install Node.js 24. Create a Neon project and copy its **direct** connection URL (turn off Connection pooling in Connect). Alternatively, install PostgreSQL 16 or newer and create a local database with `createdb -U postgres gfamily_frozen_system`.
2. Run `npm ci`.
3. Copy `.env.example` to `.env`. Replace `DATABASE_URL` with your actual Neon connection string and keep `DATABASE_SSL=true`. For a local PostgreSQL server, use your local URL and `DATABASE_SSL=false`. URL-encode special characters if entering a password manually; a URL copied from Neon is already formatted.
4. Run `npm run dev` and open **http://localhost:8790**. Do not open HTML files directly.
5. Choose **Set up store** to create the first Owner / Manager. If `OWNER_SETUP_TOKEN` is set, enter it during setup. Create staff accounts in **Team → Add member**.

The server applies tracked PostgreSQL migrations on startup. You can also run `npm run db:migrate`. Migrations run once, under a database lock, and do not reset existing records. A fresh database has no demo accounts, customers, suppliers, or stock. For a disposable local demo only, run `npm run db:seed:demo`.

## Supported workflows

- Owners: dashboard totals, catalog creation/editing, archiving zero-stock products, customers, suppliers, receipts, inventory, staff creation/role changes/deactivation/password resets, reports, CSV exports, and sale voiding.
- Cashiers: sales with fractional quantities, customer creation/editing, their own sales history, receipt reprinting, and sales export.
- Store clerks: catalog and supplier lookup, stock receipts/history, inventory, and inventory export.
- All accounts: sign-in, sign-out, password changes, and server-enforced role permissions. Password changes revoke sessions. Owners cannot disable or demote themselves.

Prices and product names are stored on each sale item. Old receipts retain the original values after catalog edits. Checkout locks product rows and records the sale and stock changes in one transaction. Repeated checkout requests from the same order use an idempotency key. Owners must provide a reason to void a sale; voiding restores stock once and excludes the sale from revenue/customer totals. Product archiving preserves transaction history.

If a price changes while a cashier has an open cart, checkout asks them to review the updated total before submitting again. Voiding a sale for an archived product reactivates that product so the restored stock remains visible.

Amounts and quantities accept up to two decimal places. Each line is rounded to centavos with integer arithmetic before summing; a single sale is capped at PHP 1 billion. Dates and reports use **Asia/Manila**. Sales and stock history are paged in groups of 100; CSV exports and printed reports include all matching sales, not just the visible page. Payment methods record how payment was received; this app does not connect to a card terminal or GCash payment gateway.

## Verification

```powershell
npm run check
```

For HTTP integration tests against real PostgreSQL, use a **local test database**, then run:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres:your_password@127.0.0.1:5432/gfamily_test'
npm run test:integration
```

Integration tests create and drop their own random PostgreSQL schema. They exercise bootstrap, roles, contact/catalog management, fractional sales, duplicate submissions, concurrent overselling, receipt snapshots, voiding, staff revocation, password changes, expiry, logout, and request validation. Without `TEST_DATABASE_URL`, this suite is explicitly skipped.

## Deployment

Follow **[DEPLOYMENT.md](DEPLOYMENT.md)** for GitHub, Neon, Render, and Vercel setup, environment variables, first-owner activation, verification, and backups. Configuration lives in `render.yaml` and `vercel.mjs`; Vercel reads its backend origin from `BACKEND_URL`. Render reads the private Neon direct connection string from `DATABASE_URL`, uses verified TLS, and opens at most five database connections by default. Startup migrations use the same direct connection.

The previous `mysql-schema.sql`, `mysql-d1-compat.js`, `migrations/` (SQLite), `wrangler.jsonc`, and `_headers` are retained as legacy references. They are not used by the supported PostgreSQL deployment. Existing MySQL/D1 data is **not automatically imported**; export, map, and verify any existing records separately before switching a live store.
