function mysqlSql(sql) {
    return sql
        .replace(/strftime\('%Y-%m-%dT%H:%M:%SZ',\s*([\w.]+)\)/gi, "DATE_FORMAT($1, '%Y-%m-%dT%H:%i:%sZ')")
        .replace(/date\('now',\s*'\+8 hours'\)/gi, "DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))")
        .replace(/date\(([\w.]+),\s*'\+8 hours'\)/gi, "DATE(DATE_ADD($1, INTERVAL 8 HOUR))");
}

class MySqlStatement {
    constructor(pool, sql) {
        this.pool = pool;
        this.sql = mysqlSql(sql);
        this.parameters = [];
    }

    bind(...parameters) {
        this.parameters = parameters;
        return this;
    }

    async first() {
        const [rows] = await this.pool.execute(this.sql, this.parameters);
        return rows[0] || null;
    }

    async all() {
        const [rows] = await this.pool.execute(this.sql, this.parameters);
        return { results: rows };
    }

    async run(connection = this.pool) {
        const [result] = await connection.execute(this.sql, this.parameters);
        return {
            meta: {
                changes: result.affectedRows,
                last_row_id: result.insertId,
            },
        };
    }
}

export class MySqlD1Compat {
    constructor(pool) {
        this.pool = pool;
    }

    prepare(sql) {
        return new MySqlStatement(this.pool, sql);
    }

    async batch(statements) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            const results = [];
            for (const statement of statements) {
                results.push(await statement.run(connection));
            }
            await connection.commit();
            return results;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

export { mysqlSql };
