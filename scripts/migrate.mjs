import "dotenv/config";
import { createPool, migrate } from "../database.js";
const pool = createPool();
try { await migrate(pool); console.log("PostgreSQL migrations applied."); }
finally { await pool.end(); }
