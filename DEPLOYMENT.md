# Deploy with GitHub, Neon, Render, and Vercel

## Before starting

- Put this project in your own GitHub/GitLab repository. This workspace does not currently contain Git metadata or a configured remote.
- Use the same repository for Vercel and Render, with the repository root as the root directory.
- Choose your final Vercel project name, such as `gfamily-frozen`. Its expected origin will be `https://gfamily-frozen.vercel.app`; confirm the actual assigned domain in Vercel.
- Run `npm ci` and `npm run check`. Do not commit `.env`, database credentials, test clusters, or backup files.

The database is hosted on **Neon**, the API on **Render**, and the frontend on **Vercel**. Do not create a Render PostgreSQL instance for this setup. Check [Neon's current plan limits](https://neon.com/pricing) before storing ongoing business data. Render's free web service still sleeps after inactivity; see [Render free instances](https://render.com/docs/free).

## 1. GitHub repository

On GitHub, create a new **private**, empty repository such as `gfamily-frozen-system`. Leave the README, license, and `.gitignore` initialization options unchecked because this project already has its files.

In the VS Code PowerShell terminal, run:

```powershell
Set-Location 'C:\Maam chona project'
git init -b main
git add .
git status --short
```

Before committing, check that `.env`, `node_modules/`, `.test-postgres/`, `.wrangler/`, and `backups/` are absent from the staged list. The existing `.gitignore` excludes them.

Then run the following, replacing `YOUR_USERNAME` with your GitHub username and adjusting the repository name if necessary:

```powershell
git commit -m "Prepare GFamily app for deployment"
git remote add origin https://github.com/YOUR_USERNAME/gfamily-frozen-system.git
git push -u origin main
```

Complete GitHub's sign-in prompt if it appears. If Git asks for your commit identity, set `git config user.name "Your Name"` and `git config user.email "Your GitHub email"`, then retry the commit. Refresh the repository page and confirm `package.json`, `render.yaml`, `vercel.mjs`, and `postgres-migrations/` appear at its root.

The hosted app uses PostgreSQL. Do not import the legacy `mysql-schema.sql` into Render; the server creates the PostgreSQL tables automatically on startup.

## 2. Neon PostgreSQL

1. Sign in at [Neon Console](https://console.neon.tech) and create a project named `gfamily-frozen-system`.
2. Choose a region close to the Render API's Singapore region. Use Singapore if it is offered for your selected cloud/plan. Keep the default database/role, or select your own.
3. Open **Connect**, select your production branch, database, and role, then turn **Connection pooling OFF**. This app uses a direct PostgreSQL connection with a small application pool because startup also runs migrations.
4. Copy the connection URL only, without a surrounding `psql` command or shell quotes. It should resemble:

   ```text
   postgresql://neondb_owner:YOUR_PASSWORD@ep-YOUR-ENDPOINT.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

5. Keep this URL private. You will enter it as `DATABASE_URL` on Render. A direct hostname does **not** contain `-pooler`.

The app verifies the TLS certificate, enables channel binding when offered, and uses up to five connections by default. It allows 30 seconds for establishing a connection. Tables are created by versioned migrations during API startup; do not paste `mysql-schema.sql` into the Neon SQL Editor.

For local development against Neon, put the actual URL in an ignored `.env` file with `DATABASE_SSL=true`. For a local PostgreSQL server, use a local URL and `DATABASE_SSL=false` instead.

References: [Neon connection strings](https://neon.com/docs/connect/connect-from-any-app), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).

## 3. Render web service

In Render, choose **New → Blueprint**, connect the repository, and select `render.yaml`. It declares:

| Resource | Configuration |
| --- | --- |
| Web service | `gfamily-api`, Node, Free, Singapore |
| Build | `npm ci --include=dev && npm run build && npm prune --omit=dev` |
| Start | `npm start` |
| Health check | `/api/health` |

The Blueprint now creates **only the web service**. When prompted, enter:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your private Neon **direct** connection string |
| `FRONTEND_URL` | Your planned Vercel origin, such as `https://gfamily-frozen.vercel.app`, with no trailing slash |

The Blueprint sets `DATABASE_SSL=true`, `DB_POOL_SIZE=5`, and generates `OWNER_SETUP_TOKEN`. Keep that token secret; retrieve it from the Render web service's Environment settings when activating the first owner. The Neon URL belongs on Render, not in the repository or Vercel.

The web service listens on `0.0.0.0` and uses Render's assigned `PORT`. Startup runs versioned migrations before accepting traffic. Do not add a paid-only pre-deploy command; migration execution is part of `npm start`.

After deployment, copy the public web service origin, for example `https://gfamily-api-xxxx.onrender.com`. Visit its `/api/health` endpoint. Expect:

```json
{"status":"ok","database":"connected"}
```

If creating the web service manually, use the same settings as `render.yaml`. Set `NODE_ENV=production`, `DATABASE_URL` to Neon's direct connection string, `DATABASE_SSL=true`, `DB_POOL_SIZE=5`, `FRONTEND_URL` to the Vercel origin, and a long random `OWNER_SETUP_TOKEN`.

### If your Render service already exists

Push the updated project to the same GitHub repository. Open the existing Render web service's **Environment** settings, replace `DATABASE_URL` with the Neon direct URL, and change `DATABASE_SSL` from `false` to `true`. Save, rebuild, and deploy the service. Do not create a duplicate Blueprint.

`sync: false` prompts for secrets only when creating a Blueprint; updating the Blueprint does not automatically replace an existing service's database URL. Enter the URL manually for an existing service. [Render secret configuration](https://render.com/docs/blueprint-spec#prompting-for-secret-values)

Removing the database from `render.yaml` does not delete an existing Render database. If it contains records, back them up and restore them into Neon **before** pointing the API at Neon. Starting with an empty Neon database creates a fresh store; existing accounts and sales are not copied automatically. Keep the old database until the data and application have been verified.

## 4. Vercel frontend

Import the same repository into Vercel. Use:

| Setting | Value |
| --- | --- |
| Framework | Other (the configuration specifies no framework) |
| Node.js | 24.x |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm ci --include=dev` |
| Environment variable | `BACKEND_URL=https://your-actual-api.onrender.com` |

`BACKEND_URL` must be an HTTPS origin with no trailing slash and no `/api` suffix. Deploy. `vercel.mjs` fails clearly if the value is missing or malformed. Do not put database credentials or the owner setup token in Vercel.

The configuration rewrites `/api/*` to Render's `/api/*`. The browser calls its own Vercel origin, so the HttpOnly session cookie works without third-party cookies or a public cross-origin API configuration. API responses disable caching. See [Vercel external rewrites](https://vercel.com/docs/rewrites) and [programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts).

Confirm Vercel's actual domain matches Render's `FRONTEND_URL`. Update Render if needed. Multiple explicit origins can be comma-separated; do not use a wildcard. When adding a custom domain, update `FRONTEND_URL` too. Use a separate backend/database for development previews to avoid testing against live store data.

## 5. Activate and verify

1. Open `https://your-frontend.vercel.app/api/health`; confirm the response above. This verifies the frontend-to-backend proxy and database.
2. Open the site root, choose **Set up store**, and enter the setup token from Render. After account creation, sign in. First-owner setup closes automatically.
3. Add real products with opening stock and prices. Add suppliers/customers as needed. Open **Team → Add member** to create a Cashier and Store Clerk.
4. In separate browser sessions, verify that the clerk can receive stock and the cashier can sell it. Reopen and print a receipt. Verify the owner dashboard and customer purchase total update.
5. Test voiding an intentional test transaction as the owner. Confirm stock restores once and revenue excludes the voided transaction. Keep the void reason in the audit record.
6. Check a narrow date range, CSV export, inventory report, staff deactivation, and sign-out. Confirm a deactivated account cannot sign in.

**Waking service:** after idle time, the first request can be slow. The frontend allows a 90-second request window and shows a retry message if the service cannot be reached. A failed checkout can be retried without changing the order; its request key prevents a second sale if the first request already completed. Avoid reloading an uncertain checkout: review Sales History before creating a new order.

## Backups and ongoing operation

Export database backups regularly. Sales CSV exports are useful for reporting but do not include the full database or accounts. Check your Neon plan's recovery and retention features rather than assuming a particular backup period.

For a full backup from your computer, set a local `DATABASE_URL` to Neon's **direct** connection string and `DATABASE_SSL=true`. Install PostgreSQL client tools matching the database server's major version (16 or newer), and run:

```powershell
npm run db:backup
```

The backup helper uses `pg_dump` from `PATH` (or `PG_DUMP_PATH`) and passes credentials through the child process environment. TLS connections use `verify-full` with system root certificates by default. If your PostgreSQL client's certificate store needs a CA bundle, set `PGSSLROOTCERT` to a trusted bundle path. It writes a custom-format dump under ignored `backups/`. Verify a restore into a separate empty database with `pg_restore` before relying on the backup. Restrict access to backups because they contain business records and password hashes. Use direct connections for both backup and restore. [Neon backup guidance](https://neon.com/docs/manage/backup-pg-dump)

Database migrations are the only automatic schema changes. Do not edit a migration after it has been applied; add a new numbered SQL file to `postgres-migrations/`. Preserve and back up the database when changing services. Startup errors are visible in Render logs; `/api/health` returns 503 if the database is unavailable.

## Deployment status

The repository is configured for Neon, Render, and Vercel. Creating the Neon project, entering its private connection URL on Render, and verifying the hosted database still require your accounts. No live database switch or data transfer is claimed by this configuration change.
