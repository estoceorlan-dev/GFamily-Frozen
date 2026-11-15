import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequest } from "./functions/api/[[path]].js";
import { createPool, migrate, PostgresDatabase } from "./database.js";

const root = fileURLToPath(new URL(".", import.meta.url));

export function createApp({ pool, env = process.env }) {
    const db = new PostgresDatabase(pool);
    const app = express();
    const origins = (env.FRONTEND_URL || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (env.NODE_ENV === "production" && !origins.length) throw new Error("Set FRONTEND_URL to your Vercel origin (https://your-app.vercel.app).");
    for (const origin of origins) {
        const url = new URL(origin);
        if (url.origin !== origin || (env.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error("FRONTEND_URL must contain exact origins without trailing slashes.");
    }
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: env.NODE_ENV === "production" ? undefined : false }));
    app.use(express.json({ limit: "128kb", strict: true }));
    app.get("/api/health", async (_request, response) => {
        try { await pool.query("SELECT 1"); response.json({ status: "ok", database: "connected" }); }
        catch { response.status(503).json({ status: "unavailable" }); }
    });
    app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many requests. Please try again in a minute." } }));
    const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, skipSuccessfulRequests: true, standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many sign-in attempts. Please try again in 15 minutes." } });
    app.use(["/api/login", "/api/register"], authLimit);
    app.use("/api", async (request, response) => {
        response.set("Cache-Control", "no-store");
        response.set("CDN-Cache-Control", "no-store");
        if (!["GET", "HEAD"].includes(request.method)) {
            const origin = request.get("origin");
            const sameOrigin = `${request.protocol}://${request.get("host")}`;
            if (origin && origin !== sameOrigin && !origins.includes(origin)) return response.status(403).json({ error: "This website is not allowed to submit requests." });
            if (request.get("sec-fetch-site") === "cross-site" && !origins.includes(origin)) return response.status(403).json({ error: "Cross-site requests are not allowed." });
            if (!request.is("application/json")) return response.status(415).json({ error: "Send requests as application/json." });
        }
        const headers = new Headers();
        for (const name of ["accept", "content-type", "cookie"]) if (request.get(name)) headers.set(name, request.get(name));
        const options = { method: request.method, headers };
        if (!["GET", "HEAD"].includes(request.method)) options.body = JSON.stringify(request.body || {});
        const webRequest = new Request(new URL(request.originalUrl, `${request.protocol}://${request.get("host")}`), options);
        const execute = async (database) => {
            if (request.method !== "GET" && /^\/(register|users(?:\/|$))/.test(request.path)) await database.executor.query("SELECT pg_advisory_xact_lock(718634)");
            return onRequest({ request: webRequest, env: { DB: database, OWNER_SETUP_TOKEN: env.OWNER_SETUP_TOKEN } });
        };
        try {
            const result = ["GET", "HEAD"].includes(request.method) ? await execute(db) : await db.transaction(execute);
            response.status(result.status);
            for (const [name, value] of result.headers) response.set(name, value);
            response.end(await result.text());
        } catch (error) {
            console.error("API request failed:", error.code || error.name);
            response.status(503).json({ error: "The service is temporarily unavailable. Please try again." });
        }
    });
    app.use(express.static(resolve(root, "dist"), { index: "index.html" }));
    app.use((_request, response) => response.status(404).json({ error: "Not found." }));
    app.use((error, _request, response, _next) => {
        const status = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500;
        response.status(status).json({ error: status === 413 ? "Request is too large." : status === 400 ? "Invalid JSON request." : "The server could not complete the request." });
    });
    return app;
}

async function start() {
    const pool = createPool();
    pool.on("error", (error) => console.error("Idle database connection failed:", error.code));
    try {
        await migrate(pool);
        const app = createApp({ pool });
        const port = Number(process.env.PORT || 8790);
        const host = process.env.HOST || "0.0.0.0";
        const server = app.listen(port, host, () => console.log(`GFamily ready on port ${port} (PostgreSQL)`));
        const shutdown = () => {
            server.close(async () => { await pool.end(); process.exit(0); });
            setTimeout(() => process.exit(1), 10_000).unref();
        };
        process.once("SIGTERM", shutdown);
        process.once("SIGINT", shutdown);
        server.on("error", async (error) => { console.error(error.message); await pool.end(); process.exitCode = 1; });
    } catch (error) { await pool.end(); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) start().catch((error) => { console.error("Startup failed:", error.message); process.exitCode = 1; });
