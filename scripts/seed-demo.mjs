import "dotenv/config";
import { createPool, migrate } from "../database.js";
const pool = createPool();
try {
    if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production.");
    await migrate(pool);
    await pool.query(`INSERT INTO products (product_code,product_name,category,unit,selling_price,current_stock,minimum_stock) VALUES
        ('P001','Chicken Wings','Chicken','kg',180,45,10),
        ('P002','Frozen Burger','Processed Food','pack',120,30,10),
        ('P003','Hotdog','Processed Food','pack',150,8,10),
        ('P004','Fish Balls','Seafood','pack',80,0,10)
        ON CONFLICT (product_code) DO NOTHING`);
    console.log("Demo catalog inserted. Existing products were preserved.");
} finally { await pool.end(); }
