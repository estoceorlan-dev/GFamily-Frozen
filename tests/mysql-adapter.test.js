import test from "node:test";
import assert from "node:assert/strict";
import { MySqlD1Compat, mysqlSql } from "../mysql-d1-compat.js";

test("translates SQLite date expressions to MySQL", () => {
    assert.equal(
        mysqlSql("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', s.sold_at), date(s.sold_at, '+8 hours'), date('now', '+8 hours')"),
        "SELECT DATE_FORMAT(s.sold_at, '%Y-%m-%dT%H:%i:%sZ'), DATE(DATE_ADD(s.sold_at, INTERVAL 8 HOUR)), DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))",
    );
});

test("prepared statements expose D1-compatible first, all, and run results", async () => {
    const calls = [];
    const pool = {
        async execute(sql, parameters) {
            calls.push({ sql, parameters });
            if (sql.startsWith("SELECT")) return [[{ value: 7 }], []];
            return [{ affectedRows: 1, insertId: 12 }, []];
        },
    };
    const db = new MySqlD1Compat(pool);

    assert.deepEqual(await db.prepare("SELECT ? AS value").bind(7).first(), { value: 7 });
    assert.deepEqual(await db.prepare("SELECT ? AS value").bind(7).all(), { results: [{ value: 7 }] });
    assert.deepEqual(await db.prepare("INSERT INTO sample (value) VALUES (?)").bind(7).run(), {
        meta: { changes: 1, last_row_id: 12 },
    });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0].parameters, [7]);
});

test("batches execute atomically and roll back on failure", async () => {
    const operations = [];
    let fail = false;
    const connection = {
        async beginTransaction() { operations.push("begin"); },
        async execute(sql) {
            operations.push(sql);
            if (fail) throw new Error("statement failed");
            return [{ affectedRows: 1, insertId: 0 }, []];
        },
        async commit() { operations.push("commit"); },
        async rollback() { operations.push("rollback"); },
        release() { operations.push("release"); },
    };
    const pool = { async getConnection() { return connection; } };
    const db = new MySqlD1Compat(pool);
    const statements = [db.prepare("UPDATE sample SET value = ?").bind(1)];

    await db.batch(statements);
    assert.deepEqual(operations, ["begin", "UPDATE sample SET value = ?", "commit", "release"]);

    operations.length = 0;
    fail = true;
    await assert.rejects(db.batch(statements), /statement failed/);
    assert.deepEqual(operations, ["begin", "UPDATE sample SET value = ?", "rollback", "release"]);
});
