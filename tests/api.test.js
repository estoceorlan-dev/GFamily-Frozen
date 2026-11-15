import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/[[path]].js";

class D1Statement {
    constructor(database, sql) {
        this.database = database;
        this.sql = sql;
        this.parameters = [];
    }

    bind(...parameters) {
        this.parameters = parameters;
        return this;
    }

    async first() {
        const { users, sessions } = this.database;
        if (this.sql.includes("SELECT COUNT(*) AS count FROM users")) return { count: users.length };
        if (this.sql.includes("FROM users WHERE username")) {
            return users.find((user) => user.username === this.parameters[0] && user.is_active === 1) || null;
        }
        if (this.sql.includes("FROM sessions s JOIN users u")) {
            const session = sessions.find((item) => item.token_hash === this.parameters[0]);
            const user = session && users.find((item) => item.user_id === session.user_id && item.is_active === 1);
            return user ? { user_id: user.user_id, username: user.username, role: user.role } : null;
        }
        if (this.sql.includes("FROM products WHERE product_id = ?")) {
            return this.database.products.find((product) => product.product_id === this.parameters[0]) || null;
        }
        return null;
    }

    async all() {
        if (this.sql.includes("FROM products WHERE is_active = 1")) return { results: this.database.products };
        if (this.sql.includes("FROM inventory_status")) return { results: this.database.products };
        if (this.sql.includes("FROM sales s LEFT JOIN customers")) {
            const sales = this.sql.includes("WHERE s.cashier_id = ?")
                ? this.database.sales.filter((sale) => sale.cashier_id === this.parameters[0])
                : this.database.sales;
            return {
                results: sales.map((sale) => ({
                    transaction_code: sale.transaction_code,
                    customer_name: "Walk-in Customer",
                    total_amount: sale.total_amount,
                    payment_method: sale.payment_method,
                    status: "Completed",
                    sold_at: "2026-11-10T00:00:00Z",
                })),
            };
        }
        if (this.sql.includes("FROM users ORDER BY username")) {
            return { results: this.database.users.map(({ password_hash, ...user }) => user) };
        }
        return { results: [] };
    }

    async run() {
        const { users, sessions, products } = this.database;
        if (this.sql.startsWith("DELETE FROM sessions WHERE expires_at")) return { meta: { changes: 0 } };
        if (this.sql.startsWith("DELETE FROM sessions WHERE token_hash")) {
            const index = sessions.findIndex((session) => session.token_hash === this.parameters[0]);
            if (index >= 0) sessions.splice(index, 1);
            return { meta: { changes: index >= 0 ? 1 : 0 } };
        }
        if (this.sql.startsWith("INSERT INTO sessions")) {
            const [session_id, user_id, token_hash, expires_at] = this.parameters;
            sessions.push({ session_id, user_id, token_hash, expires_at });
            return { meta: { changes: 1 } };
        }
        if (this.sql.startsWith("INSERT INTO users") && this.sql.includes("WHERE NOT EXISTS")) {
            if (users.length) return { meta: { changes: 0 } };
            const [username, password_hash, role] = this.parameters;
            users.push({
                user_id: this.database.nextId++,
                username,
                password_hash,
                role,
                is_active: 1,
                created_at: "2026-11-10 00:00:00",
            });
            return { meta: { changes: 1 } };
        }
        if (this.sql.startsWith("INSERT INTO users")) {
            const [username, password_hash, role] = this.parameters;
            if (users.some((user) => user.username === username)) throw new Error("UNIQUE constraint failed");
            users.push({
                user_id: this.database.nextId++,
                username,
                password_hash,
                role,
                is_active: 1,
                created_at: "2026-11-10 00:00:00",
            });
            return { meta: { changes: 1 } };
        }
        if (this.sql.startsWith("INSERT INTO products")) {
            const [product_code, product_name, category, unit, selling_price, current_stock, minimum_stock] = this.parameters;
            const product = {
                product_id: this.database.nextId++,
                product_code,
                product_name,
                category,
                unit,
                selling_price,
                current_stock,
                minimum_stock,
            };
            products.push(product);
            return { meta: { changes: 1, last_row_id: product.product_id } };
        }
        return { meta: { changes: 0 } };
    }
}

function createDatabase() {
    return {
        users: [],
        sessions: [],
        products: [{
            product_id: 1,
            product_code: "P001",
            product_name: "Chicken Wings",
            category: "Chicken",
            unit: "kg",
            selling_price: 180,
            current_stock: 45,
            minimum_stock: 10,
        }],
        sales: [],
        saleItems: [],
        nextId: 2,
        prepare(sql) {
            return new D1Statement(this, sql);
        },
        async batch(statements) {
            const products = this.products.map((product) => ({ ...product }));
            const sales = [...this.sales];
            const saleItems = [...this.saleItems];
            for (const statement of statements) {
                if (statement.sql.startsWith("INSERT INTO sales")) {
                    const [sale_id, transaction_code, customer_id, cashier_id, subtotal, total_amount, payment_method] = statement.parameters;
                    sales.push({ sale_id, transaction_code, customer_id, cashier_id, subtotal, total_amount, payment_method });
                } else if (statement.sql.startsWith("INSERT INTO sale_items")) {
                    const [sale_id, product_id, quantity, unit_price] = statement.parameters;
                    saleItems.push({ sale_id, product_id, quantity, unit_price });
                } else if (statement.sql.startsWith("UPDATE products SET current_stock = current_stock -")) {
                    const [quantity, productId] = statement.parameters;
                    const product = products.find((item) => item.product_id === productId);
                    if (!product) throw new Error("CHECK constraint failed: product");
                    product.current_stock -= quantity;
                    if (product.current_stock < 0) throw new Error("CHECK constraint failed: current_stock >= 0");
                }
            }
            this.products = products;
            this.sales = sales;
            this.saleItems = saleItems;
            return [];
        },
    };
}

function createRequest(path, { method = "GET", body, cookie, accept } = {}) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (cookie) headers.cookie = cookie;
    if (accept) headers.accept = accept;
    return new Request(`https://gfamily.test/api/${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

async function call(env, path, options) {
    const response = await onRequest({ request: createRequest(path, options), env });
    const body = await response.json().catch(() => null);
    return { response, body };
}

async function createOwner(env, username = "manager") {
    return call(env, "register", {
        method: "POST",
        body: {
            username,
            password: "secure-password",
            role: "Owner / Manager",
        },
    });
}

async function signIn(env, username) {
    const result = await call(env, "login", {
        method: "POST",
        body: { username, password: "secure-password" },
    });
    const cookie = result.response.headers.get("set-cookie");
    return { ...result, cookie: cookie?.split(";")[0] };
}

test("unauthenticated requests cannot access protected data", async () => {
    const env = { DB: createDatabase() };
    for (const path of ["products", "product-options", "customers", "sales", "inventory", "suppliers", "users", "reports/summary"]) {
        const { response } = await call(env, path);
        assert.equal(response.status, 401, `Expected ${path} to require a session`);
    }
});

test("first account becomes the owner and later anonymous registration is blocked", async () => {
    const env = { DB: createDatabase() };
    const setupStatus = await call(env, "setup-status");
    assert.deepEqual(setupStatus.body, { ownerSetupAvailable: true, setupTokenRequired: false });

    const owner = await createOwner(env);
    assert.equal(owner.response.status, 201);
    assert.deepEqual((await call(env, "setup-status")).body, { ownerSetupAvailable: false, setupTokenRequired: false });

    const secondOwner = await createOwner(env, "attacker");
    assert.equal(secondOwner.response.status, 403);
    const anonymousStaff = await call(env, "register", {
        method: "POST",
        body: { username: "cashier", password: "secure-password", role: "Cashier" },
    });
    assert.equal(anonymousStaff.response.status, 403);
});

test("roles have distinct server-side permissions and logout revokes the cookie", async () => {
    const env = { DB: createDatabase() };
    assert.equal((await createOwner(env)).response.status, 201);
    const ownerLogin = await signIn(env, "manager");
    assert.equal(ownerLogin.response.status, 200);
    assert.equal(ownerLogin.body.role, "Owner / Manager");
    assert.match(ownerLogin.cookie, /^gfamily_session=/);
    assert.match(ownerLogin.response.headers.get("set-cookie"), /HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200; Secure/);

    const createdProduct = await call(env, "products", {
        method: "POST",
        cookie: ownerLogin.cookie,
        body: { productName: "Fish Fillet", category: "Seafood", unit: "pack", sellingPrice: 200, currentStock: 10, minimumStock: 2 },
    });
    assert.equal(createdProduct.response.status, 201);

    const createdCashier = await call(env, "register", {
        method: "POST",
        cookie: ownerLogin.cookie,
        body: { username: "cashier", password: "secure-password", role: "Cashier" },
    });
    assert.equal(createdCashier.response.status, 201);
    const cashierLogin = await signIn(env, "cashier");
    assert.equal(cashierLogin.response.status, 200);
    assert.equal(cashierLogin.body.role, "Cashier");
    assert.equal((await call(env, "products", { cookie: cashierLogin.cookie })).response.status, 200);
    assert.equal((await call(env, "users", { cookie: cashierLogin.cookie })).response.status, 403);
    assert.equal((await call(env, "reports/summary", { cookie: cashierLogin.cookie })).response.status, 403);
    assert.equal((await call(env, "products", {
        method: "POST",
        cookie: cashierLogin.cookie,
        body: { productName: "Unauthorized", category: "Frozen", unit: "pack", sellingPrice: 10, currentStock: 1, minimumStock: 0 },
    })).response.status, 403);
    assert.equal((await call(env, "stock-in", {
        method: "POST",
        cookie: cashierLogin.cookie,
        body: { productId: 1, quantity: 1 },
    })).response.status, 403);

    const cashierId = env.DB.users.find((user) => user.username === "cashier").user_id;
    const completedSale = await call(env, "sales", {
        method: "POST",
        cookie: cashierLogin.cookie,
        body: { cashierId: 9999, paymentMethod: "Card", items: [{ productId: 1, quantity: 2 }] },
    });
    assert.equal(completedSale.response.status, 201);
    assert.equal(completedSale.body.total, 360);
    assert.equal(env.DB.sales[0].cashier_id, cashierId);
    assert.equal(env.DB.products[0].current_stock, 43);
    assert.equal((await call(env, "sales", { cookie: cashierLogin.cookie })).body.length, 1);
    const failedSale = await call(env, "sales", {
        method: "POST",
        cookie: cashierLogin.cookie,
        body: { items: [{ productId: 1, quantity: 100 }] },
    });
    assert.equal(failedSale.response.status, 400);
    assert.equal(env.DB.sales.length, 1);

    await call(env, "logout", { method: "POST", cookie: cashierLogin.cookie, body: {} });
    assert.equal((await call(env, "products", { cookie: cashierLogin.cookie })).response.status, 401);

    const createdClerk = await call(env, "register", {
        method: "POST",
        cookie: ownerLogin.cookie,
        body: { username: "clerk", password: "secure-password", role: "Store Clerk" },
    });
    assert.equal(createdClerk.response.status, 201);
    const clerkLogin = await signIn(env, "clerk");
    assert.equal((await call(env, "inventory", { cookie: clerkLogin.cookie })).response.status, 200);
    assert.equal((await call(env, "suppliers", { cookie: clerkLogin.cookie })).response.status, 200);
    assert.equal((await call(env, "sales", { cookie: clerkLogin.cookie })).response.status, 403);
    assert.equal((await call(env, "stock-in", {
        method: "POST",
        cookie: clerkLogin.cookie,
        body: { productId: 1, quantity: 2 },
    })).response.status, 201);
});

test("invalid sale date ranges are rejected before querying sales", async () => {
    const env = { DB: createDatabase() };
    await createOwner(env);
    const ownerLogin = await signIn(env, "manager");
    const { response } = await call(env, "sales?from=2026-02-31", { cookie: ownerLogin.cookie });
    assert.equal(response.status, 400);
});

test("browser logout clears the cookie and redirects even when D1 is unavailable", async () => {
    const { response } = await call({}, "logout", {
        method: "POST",
        cookie: "gfamily_session=old-session",
        accept: "text/html",
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "https://gfamily.test/admindashboard.html?logout=incomplete");
    assert.match(response.headers.get("set-cookie"), /gfamily_session=; HttpOnly; SameSite=Strict; Path=\/; Max-Age=0; Secure/);
});
