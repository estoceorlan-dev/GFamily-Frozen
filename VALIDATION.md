# Verification record — November 15, 2026

Verified locally with Node.js 24.14.1 and a separate PostgreSQL 18 test cluster. No existing store database was used for these checks.

| Check | Result |
| --- | --- |
| `npm run check` | Passed after the Neon configuration change: 25 unit/DOM/configuration tests, then the Tailwind/frontend build |
| `npm run test:integration` with a local test URL | Passed after the Neon configuration change: 7 PostgreSQL HTTP integration tests; none skipped |
| `npm audit` | 0 vulnerabilities |
| Production server startup | Passed with `NODE_ENV=production`: automatic migrations, `/api/health`, static root, `/cashier.html`, unauthenticated API protection, and unknown-route handling |
| Database migrations | Applied twice without resetting data |
| Backup and restore | Passed November 14 with local PostgreSQL: restore into a separate database recovered all 4 fixture products; Neon backup/restore remains unverified |

The PostgreSQL suite covers initial-owner token protection and concurrent setup, account permissions, customer/supplier editing, stock receipts, session cookies/expiry, staff deactivation, password changes, logout, date filtering and pagination, sale receipt snapshots, price-change rejection, and exact centavo rounding. Concurrent checkout tests prove that two requests cannot sell the last unit twice. Duplicate checkout retries produce one sale. Invalid customer references roll back stock changes. Concurrent void requests restore stock once, including reactivating an archived product when stock returns.

DOM tests load all three dashboard documents and their real frontend script, with simulated API responses. They check role-specific requests, navigation, mobile drawer state and focus isolation, category/search filtering, setup-token fields, password visibility, default select values, fractional cart totals, checkout submission locking, server receipts, price-change review, and visible form errors.

## UI refresh

The frontend now compiles Tailwind CSS 4.3.5 locally and bundles an Inter variable font and its license. Verified that the generated stylesheet has no uncompiled `@apply` directives and that the built font, license, and cashier alias exist. Vercel and Render build settings include the required development dependencies; Render prunes them after building.

The checked palette pairs have contrast ratios of 17.72:1 for primary text on white, 4.83:1 for secondary text on white, 4.55:1 for secondary text on the canvas, and 7.29:1 for active navigation text. These palette checks are not a full accessibility audit. Browser preview access remained unavailable during the UI refresh.

## Remaining external verification

Browser automation was unavailable in this session, so visual rendering, responsive layout, printer output, and downloaded CSV behavior need a real browser check. DOM tests do not replace those checks.

The app has not been deployed to Vercel or Render. A Neon project/credential was not supplied, so no live Neon connection, hosted migration, or data transfer was performed. Public HTTPS, the Vercel-to-Render rewrite, production session cookies, Render cold starts, and actual hosted-database connectivity must be verified after provisioning and setting real environment variables. Follow [DEPLOYMENT.md](DEPLOYMENT.md). No existing MySQL/D1 or Render PostgreSQL records have been imported into Neon.

## Neon configuration

The Render Blueprint now provisions only the API and prompts for the private Neon `DATABASE_URL`; `DATABASE_SSL` is `true`. Connection tests exercise the actual installed `pg` driver's parsing to confirm certificate verification survives SSL URL parameters, channel binding is enabled, insecure Neon settings are rejected, and accidental `-pooler` URLs give a direct-connection instruction. Local PostgreSQL remains supported without TLS. Production startup and health were rechecked against the local test cluster using the new pool configuration.

The application schema did not change. Existing Neon/Render data is not copied automatically. The deployment guide includes both fresh setup and updating an existing Render service's saved environment variables.

The temporary test PostgreSQL server was stopped after verification. Automatic approval review blocked deletion of its directory, so `.test-postgres/` and the synthetic dump under `backups/` remain locally; both are ignored by Git and excluded from the frontend build. They contain test fixtures only.
