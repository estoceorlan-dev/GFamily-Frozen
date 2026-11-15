import pg from "pg";
import { readFile, readdir } from "node:fs/promises";

// Application amounts are bounded well below Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1114, (value) => `${value.replace(" ", "T")}Z`);

export function postgresSql(sql) {
    let index = 0;
    return sql
        .replace(/strftime\('%Y-%m-%dT%H:%M:%SZ',\s*([\w.]+)\)/gi, `to_char($1, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`)
        .replace(/date\('now',\s*'\+8 hours'\)/gi, "((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)")
        .replace(/date\(([\w.]+),\s*'\+8 hours'\)/gi, "(($1 + INTERVAL '8 hours')::date)")
        .replace(/'(?:''|[^'])*'|\?/g, (token) => token === "?" ? `$${++index}` : token);
}

const idColumns = { users: "user_id", products: "product_id", customers: "customer_id", suppliers: "supplier_id" };

class Statement {
    constructor(db, sql) { this.db = db; this.sql = postgresSql(sql); this.parameters = []; }
    bind(...parameters) { this.parameters = parameters; return this; }
    async first() { return (await this.db.executor.query(this.sql, this.parameters)).rows[0] || null; }
    async all() { return { results: (await this.db.executor.query(this.sql, this.parameters)).rows }; }
    async run() {
        const table = this.sql.match(/^\s*INSERT INTO (\w+)/i)?.[1];
        const id = idColumns[table];
        const sql = id && !/\bRETURNING\b/i.test(this.sql) ? `${this.sql} RETURNING ${id}` : this.sql;
        const result = await this.db.executor.query(sql, this.parameters);
        return { meta: { changes: result.rowCount, last_row_id: id ? result.rows[0]?.[id] : undefined } };
    }
}

export class PostgresDatabase {
    constructor(executor, transactional = false) { this.executor = executor; this.transactional = transactional; this.lockRows = transactional; }
    prepare(sql) { return new Statement(this, sql); }
    async batch(statements) {
        if (this.transactional) {
            const results = [];
            for (const statement of statements) results.push(await statement.run());
            return results;
        }
        return this.transaction(async (db) => {
            const results = [];
            for (const statement of statements) results.push(await db.prepare(statement.sql).bind(...statement.parameters).run());
            return results;
        });
    }
    async transaction(callback) {
        const client = await this.executor.connect();
        try {
            await client.query("BEGIN");
            await client.query("SET LOCAL lock_timeout = '10s'");
            const result = await callback(new PostgresDatabase(client, true));
            await client.query(result instanceof Response && !result.ok ? "ROLLBACK" : "COMMIT");
            return result;
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
    }
}

export function poolConfiguration(env = process.env) {
    if (!env.DATABASE_URL) throw new Error("Set DATABASE_URL to your PostgreSQL connection string. See .env.example.");
    if (env.DATABASE_SSL && !["true", "false"].includes(env.DATABASE_SSL)) throw new Error("DATABASE_SSL must be true or false.");
    let connection;
    try { connection = new URL(env.DATABASE_URL); }
    catch { throw new Error("DATABASE_URL must be a valid PostgreSQL connection string."); }
    if (!["postgres:", "postgresql:"].includes(connection.protocol)) throw new Error("DATABASE_URL must use the postgres or postgresql protocol.");
    const neon = connection.hostname.endsWith(".neon.tech");
    if (neon && connection.hostname.includes("-pooler.")) throw new Error("Use Neon's direct connection: turn off Connection pooling in Neon Connect. Startup migrations and backups use this same URL.");
    if (neon && env.DATABASE_SSL === "false") throw new Error("Neon requires TLS. Set DATABASE_SSL=true.");
    const tls = neon || env.DATABASE_SSL === "true";
    if (neon || env.DATABASE_SSL) {
        // pg's URL SSL parameters otherwise replace the explicit TLS settings.
        for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"]) connection.searchParams.delete(key);
    }
    const max = Number(env.DB_POOL_SIZE || 5);
    if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error("DB_POOL_SIZE must be an integer between 1 and 20.");
    return {
        connectionString: connection.toString(),
        ...(neon || env.DATABASE_SSL ? { ssl: tls ? { rejectUnauthorized: true } : false } : {}),
        enableChannelBinding: tls,
        max,
        connectionTimeoutMillis: 30_000,
        idleTimeoutMillis: 30_000,
        options: "-c timezone=UTC",
    };
}

export function createPool(env = process.env) {
    return new pg.Pool(poolConfiguration(env));
}

export async function migrate(pool) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(718633)");
        await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)");
        const directory = new URL("./postgres-migrations/", import.meta.url);
        for (const name of (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
            if ((await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name])).rowCount) continue;
            await client.query(await readFile(new URL(name, directory), "utf8"));
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        }
        await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
}
