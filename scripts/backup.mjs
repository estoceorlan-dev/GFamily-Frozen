import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { poolConfiguration } from "../database.js";

const config = poolConfiguration();
const url = new URL(config.connectionString);
const verifiedTls = config.ssl?.rejectUnauthorized === true;
const directory = resolve("backups");
await mkdir(directory, { recursive: true });
const output = resolve(directory, `gfamily-${new Date().toISOString().replaceAll(":", "-")}.dump`);
const child = spawn(process.env.PG_DUMP_PATH || "pg_dump", ["--format=custom", "--no-owner", "--file", output], {
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: verifiedTls ? "verify-full" : config.ssl === false ? "disable" : url.searchParams.get("sslmode") || "prefer", ...(verifiedTls ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT || "system" } : {}), PGCHANNELBINDING: url.searchParams.get("channel_binding") || "prefer", PGCONNECT_TIMEOUT: "30" },
});
child.on("error", () => { console.error("Could not run pg_dump. Install PostgreSQL client tools or set PG_DUMP_PATH."); process.exitCode = 1; });
child.on("exit", (code) => { if (code === 0) console.log(`Backup written to ${output}`); else process.exitCode = code || 1; });
