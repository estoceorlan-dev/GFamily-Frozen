import test from "node:test";
import assert from "node:assert/strict";
import { createVercelConfig } from "../deployment-config.mjs";
import { postgresSql } from "../database.js";
import { lineTotalCents } from "../functions/_lib.js";

test("deployment configuration preserves same-origin API sessions", () => {
    const config = createVercelConfig("https://gfamily-api.onrender.com");
    assert.equal(config.outputDirectory, "dist");
    assert.deepEqual(config.rewrites, [{ source: "/api/:path*", destination: "https://gfamily-api.onrender.com/api/:path*" }]);
    assert.throws(() => createVercelConfig(), /BACKEND_URL/);
    assert.throws(() => createVercelConfig("http://example.com"), /HTTPS/);
    assert.throws(() => createVercelConfig("https://example.com/api"), /HTTPS/);
});

test("PostgreSQL translation preserves literals and binds input parameters", () => {
    assert.equal(postgresSql("SELECT '?' AS literal, ? AS input, '?' AS again, ?"), "SELECT '?' AS literal, $1 AS input, '?' AS again, $2");
    assert.match(postgresSql("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', s.sold_at), date(s.sold_at, '+8 hours'), date('now', '+8 hours')"), /to_char.*INTERVAL '8 hours'.*Asia\/Manila/);
});

test("fractional prices round exactly to centavos", () => {
    assert.equal(lineTotalCents(0.5, 1.13), 57n);
    assert.equal(lineTotalCents(0.5, 10.01), 501n);
    assert.equal(lineTotalCents(0.01, 1), 1n);
    assert.equal(lineTotalCents(1_000_000, 1_000_000_000), 100_000_000_000_000_000n);
});
