import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { poolConfiguration } from "../database.js";

const neonUrl = "postgresql://neondb_owner:test-password@ep-example.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

test("Neon connection strings retain verified TLS through pg's URL parsing", async () => {
    const config = poolConfiguration({ DATABASE_URL: neonUrl, DATABASE_SSL: "true" });
    const client = new pg.Client(config);
    assert.equal(client.connectionParameters.host, "ep-example.ap-southeast-1.aws.neon.tech");
    assert.equal(client.connectionParameters.database, "neondb");
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
    assert.equal(client.enableChannelBinding, true);
    assert.equal(config.max, 5);
    assert.equal(config.connectionTimeoutMillis, 30_000);
    assert.equal(new URL(config.connectionString).searchParams.has("sslmode"), false);
    assert.equal(new URL(config.connectionString).searchParams.get("channel_binding"), "require");
    await client.end();
});

test("Neon automatically uses TLS and rejects an explicit insecure setting", () => {
    assert.equal(poolConfiguration({ DATABASE_URL: neonUrl }).ssl.rejectUnauthorized, true);
    assert.throws(() => poolConfiguration({ DATABASE_URL: neonUrl, DATABASE_SSL: "false" }), /Neon requires TLS/);
    const unsafeUrl = neonUrl.replace("sslmode=require", "sslmode=no-verify");
    const client = new pg.Client(poolConfiguration({ DATABASE_URL: unsafeUrl }));
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
});

test("Neon pooled URLs give a clear instruction for startup migrations", () => {
    assert.throws(() => poolConfiguration({ DATABASE_URL: neonUrl.replace("ep-example.", "ep-example-pooler.") }), /direct connection/);
});

test("local PostgreSQL remains usable without TLS", () => {
    const config = poolConfiguration({ DATABASE_URL: "postgresql://postgres:local-password@127.0.0.1:5432/gfamily_test", DATABASE_SSL: "false", DB_POOL_SIZE: "3" });
    const client = new pg.Client(config);
    assert.equal(client.connectionParameters.ssl, false);
    assert.equal(client.enableChannelBinding, false);
    assert.equal(config.max, 3);
});

test("invalid connection settings fail without exposing credentials", () => {
    assert.throws(() => poolConfiguration({}), /Set DATABASE_URL/);
    assert.throws(() => poolConfiguration({ DATABASE_URL: "not a url" }), /valid PostgreSQL/);
    assert.throws(() => poolConfiguration({ DATABASE_URL: "https://example.com" }), /protocol/);
    assert.throws(() => poolConfiguration({ DATABASE_URL: neonUrl, DATABASE_SSL: "yes" }), /true or false/);
    for (const size of ["0", "21", "NaN", "1.5"]) assert.throws(() => poolConfiguration({ DATABASE_URL: neonUrl, DB_POOL_SIZE: size }), /DB_POOL_SIZE/);
});
