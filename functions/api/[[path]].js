import { getCookie, hashPassword, hashToken, hasFields, internalError, json, lineTotalCents, makeCode, nonNegativeNumber, positiveInteger, positiveNumber, readBody, verifyPassword } from "../_lib.js";

const ROLES = ["Owner / Manager", "Cashier", "Store Clerk"];
const SESSION_COOKIE = "gfamily_session";
const SESSION_HOURS = 12;

function validDate(value) {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function localDateBound(value, dayOffset = 0) {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    date.setUTCHours(date.getUTCHours() - 8);
    return date.toISOString().replace("T", " ").slice(0, 19);
}

function sessionCookie(token, request, maxAge = SESSION_HOURS * 60 * 60) {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function getSession(request, env) {
    const token = getCookie(request, SESSION_COOKIE);
    if (!token) return null;
    return env.DB.prepare(
        "SELECT u.user_id, u.username, u.role FROM sessions s JOIN users u ON u.user_id = s.user_id WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = 1 LIMIT 1",
    ).bind(await hashToken(token)).first();
}

async function requireRole(request, env, roles) {
    const user = await getSession(request, env);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    if (!roles.includes(user.role)) return json({ error: "You do not have permission to perform this action." }, 403);
    return user;
}

async function login(request, env) {
    const body = await readBody(request);
    if (!hasFields(body, ["username", "password"])) {
        return json({ error: "Username and password are required." }, 400);
    }
    if (typeof body.username !== "string" || typeof body.password !== "string") return json({ error: "Enter a username and password." }, 400);

    const user = await env.DB.prepare(
        "SELECT user_id, username, password_hash, role FROM users WHERE username = ? AND is_active = 1 LIMIT 1",
    ).bind(String(body.username).trim().toLowerCase()).first();
    if (!user || !(await verifyPassword(String(body.password), user.password_hash))) {
        return json({ error: "Invalid username or password." }, 401);
    }

    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
    await env.DB.prepare(
        "INSERT INTO sessions (session_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), user.user_id, await hashToken(token), expiresAt).run();

    return json(
        { userId: user.user_id, username: user.username, role: user.role },
        200,
        { "set-cookie": sessionCookie(token, request), "cache-control": "no-store" },
    );
}

async function logout(request, env) {
    const token = getCookie(request, SESSION_COOKIE);
    let revocationFailed = false;
    if (token && env.DB) {
        try {
            await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
        } catch (error) {
            console.error("Could not revoke session during logout:", error);
            revocationFailed = true;
        }
    } else if (token) {
        revocationFailed = true;
    }

    const headers = {
        "set-cookie": sessionCookie("", request, 0),
        "cache-control": "no-store",
    };
    if ((request.headers.get("Accept") || "").includes("text/html")) {
        const destination = new URL("/admindashboard.html", request.url);
        if (revocationFailed) destination.searchParams.set("logout", "incomplete");
        return new Response(null, {
            status: 303,
            headers: { ...headers, location: destination.toString() },
        });
    }
    return json(
        revocationFailed
            ? { error: "Your browser session was cleared, but the server could not revoke it. Contact an administrator." }
            : { message: "Signed out." },
        revocationFailed ? 503 : 200,
        headers,
    );
}

async function register(request, env) {
    const body = await readBody(request);
    if (!hasFields(body, ["username", "password", "role"])) {
        return json({ error: "Username, password, and role are required." }, 400);
    }
    if (typeof body.username !== "string" || typeof body.password !== "string") return json({ error: "Enter a username and password." }, 400);

    const username = String(body.username).trim().toLowerCase();
    const password = String(body.password);
    if (username.length < 3 || username.length > 50) {
        return json({ error: "Username must be between 3 and 50 characters." }, 400);
    }
    if (password.length < 8 || password.length > 256) {
        return json({ error: "Password must be between 8 and 256 characters." }, 400);
    }
    if (!ROLES.includes(body.role)) return json({ error: "Invalid role selected." }, 400);

    const currentUser = await getSession(request, env);
    const userCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    const isInitialOwner = Number(userCount.count) === 0;
    if (isInitialOwner && env.OWNER_SETUP_TOKEN && body.setupToken !== env.OWNER_SETUP_TOKEN) {
        return json({ error: "Enter the owner setup token configured by the administrator." }, 403);
    }
    if (currentUser?.role !== "Owner / Manager" && (!isInitialOwner || body.role !== "Owner / Manager")) {
        return json({ error: "Only an owner can create accounts. The first account can only be an Owner / Manager." }, 403);
    }

    const passwordHash = await hashPassword(password);
    try {
        const result = isInitialOwner && currentUser?.role !== "Owner / Manager"
            ? await env.DB.prepare(
                "INSERT INTO users (username, password_hash, role) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)",
            ).bind(username, passwordHash, body.role).run()
            : await env.DB.prepare(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ).bind(username, passwordHash, body.role).run();
        if (!result.meta.changes) {
            return json({ error: "Initial account setup has already been completed. Ask the owner to create your account." }, 403);
        }
        return json({ message: "Account created successfully." }, 201);
    } catch (error) {
        if (error.code === "23505" || String(error.message).includes("UNIQUE constraint failed")) {
            return json({ error: "That username is already registered." }, 409);
        }
        throw error;
    }
}

async function users(env) {
    const result = await env.DB.prepare(
        "SELECT user_id, username, role, is_active, created_at FROM users ORDER BY username",
    ).all();
    return json(result.results);
}

async function products(env) {
    const result = await env.DB.prepare(
        "SELECT product_id, product_code, product_name, category, unit, selling_price, current_stock, minimum_stock FROM products WHERE is_active = 1 ORDER BY product_name",
    ).all();
    return json(result.results);
}

async function createProduct(request, env) {
    const body = await readBody(request);
    if (!hasFields(body, ["productName", "category", "unit", "sellingPrice", "currentStock", "minimumStock"])) {
        return json({ error: "Product name, category, unit, price, stock, and minimum stock are required." }, 400);
    }
    const productName = String(body.productName).trim();
    const category = String(body.category).trim();
    const unit = String(body.unit).trim();
    const sellingPrice = nonNegativeNumber(body.sellingPrice);
    const currentStock = nonNegativeNumber(body.currentStock);
    const minimumStock = nonNegativeNumber(body.minimumStock);
    if (!productName || productName.length > 120 || !category || category.length > 80 || !unit || unit.length > 24 ||
        !Number.isFinite(sellingPrice) || sellingPrice < 0 || sellingPrice > 1_000_000_000 ||
        !Number.isFinite(currentStock) || currentStock < 0 || currentStock > 1_000_000_000 ||
        !Number.isFinite(minimumStock) || minimumStock < 0 || minimumStock > 1_000_000_000) {
        return json({ error: "Enter valid product details. Price and stock values cannot be negative." }, 400);
    }
    const code = makeCode("P");
    const result = await env.DB.prepare(
        "INSERT INTO products (product_code, product_name, category, unit, selling_price, current_stock, minimum_stock) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(code, productName, category, unit, sellingPrice, currentStock, minimumStock).run();
    return json({ productId: result.meta.last_row_id, productCode: code }, 201);
}

async function updateProduct(request, env, productId) {
    const id = positiveInteger(productId);
    if (!id) return json({ error: "Invalid product." }, 400);
    const body = await readBody(request);
    if (!hasFields(body, ["productName", "category", "unit", "sellingPrice", "minimumStock"])) {
        return json({ error: "Product name, category, unit, price, and minimum stock are required." }, 400);
    }
    const values = [String(body.productName).trim(), String(body.category).trim(), String(body.unit).trim(), nonNegativeNumber(body.sellingPrice), nonNegativeNumber(body.minimumStock)];
    if (!values[0] || values[0].length > 120 || !values[1] || values[1].length > 80 || !values[2] || values[2].length > 24 ||
        !Number.isFinite(values[3]) || values[3] < 0 || values[3] > 1_000_000_000 ||
        !Number.isFinite(values[4]) || values[4] < 0 || values[4] > 1_000_000_000) {
        return json({ error: "Enter valid product details. Price and minimum stock cannot be negative." }, 400);
    }
    const result = await env.DB.prepare(
        "UPDATE products SET product_name = ?, category = ?, unit = ?, selling_price = ?, minimum_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND is_active = 1",
    ).bind(...values, id).run();
    if (!result.meta.changes) return json({ error: "Product not found." }, 404);
    return json({ message: "Product updated." });
}

async function customers(env) {
    const result = await env.DB.prepare(
        "SELECT c.customer_id, c.customer_code, c.full_name, c.contact_number, COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.total_amount ELSE 0 END), 0) AS total_purchases FROM customers c LEFT JOIN sales s ON s.customer_id = c.customer_id GROUP BY c.customer_id ORDER BY c.full_name",
    ).all();
    return json(result.results);
}

async function createCustomer(request, env) {
    const body = await readBody(request);
    if (!hasFields(body, ["fullName", "contactNumber"])) {
        return json({ error: "Name and contact number are required." }, 400);
    }
    const fullName = String(body.fullName).trim();
    const contactNumber = String(body.contactNumber).trim();
    if (fullName.length > 120 || contactNumber.length > 40) return json({ error: "Customer details are too long." }, 400);
    const code = makeCode("C");
    const result = await env.DB.prepare(
        "INSERT INTO customers (customer_code, full_name, contact_number) VALUES (?, ?, ?)",
    ).bind(code, fullName, contactNumber).run();
    return json({ customerId: result.meta.last_row_id, customerCode: code }, 201);
}

async function sales(env, user, dateFrom, dateTo, offset = 0) {
    const query = "SELECT s.sale_id, s.transaction_code, COALESCE(c.full_name, 'Walk-in Customer') AS customer_name, s.total_amount, s.payment_method, s.status, strftime('%Y-%m-%dT%H:%M:%SZ', s.sold_at) AS sold_at FROM sales s LEFT JOIN customers c ON c.customer_id = s.customer_id";
    const conditions = [];
    const parameters = [];
    if (user.role === "Cashier") {
        conditions.push("s.cashier_id = ?");
        parameters.push(user.user_id);
    }
    if (dateFrom) {
        conditions.push("s.sold_at >= ?");
        parameters.push(localDateBound(dateFrom));
    }
    if (dateTo) {
        conditions.push("s.sold_at < ?");
        parameters.push(localDateBound(dateTo, 1));
    }
    const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const statement = env.DB.prepare(`${query}${where} ORDER BY s.sold_at DESC, s.sale_id DESC LIMIT 100 OFFSET ${offset}`);
    const result = parameters.length
        ? await statement.bind(...parameters).all()
        : await statement.all();
    return json(result.results);
}

async function createSale(request, env, user) {
    const body = await readBody(request);
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
        return json({ error: "Add between 1 and 100 products to the sale." }, 400);
    }
    const customerId = body.customerId ? positiveInteger(body.customerId) : null;
    if (body.customerId && !customerId) return json({ error: "Invalid customer." }, 400);
    const paymentMethod = body.paymentMethod || "Cash";
    if (!["Cash", "GCash", "Card"].includes(paymentMethod)) return json({ error: "Invalid payment method." }, 400);
    let payloadHash;
    if (body.requestId && env.DB.lockRows) {
        if (!/^[a-f0-9-]{36}$/i.test(body.requestId)) return json({ error: "Invalid sale request ID." }, 400);
        await env.DB.executor.query("SELECT pg_advisory_xact_lock(hashtext($1))", [body.requestId]);
        payloadHash = await hashToken(JSON.stringify({ customerId, paymentMethod, items: body.items }));
        const previous = await env.DB.prepare("SELECT * FROM sale_requests WHERE request_id = ?").bind(body.requestId).first();
        if (previous) {
            if (previous.user_id !== user.user_id || previous.payload_hash !== payloadHash) return json({ error: "This request ID belongs to a different sale." }, 409);
            return saleDetail(env, user, previous.sale_id);
        }
    }

    const requested = new Map();
    const items = [];
    for (const item of body.items) {
        const productId = positiveInteger(item?.productId);
        const quantity = positiveNumber(item?.quantity);
        if (!productId || !quantity || quantity > 1_000_000) return json({ error: "Invalid product or quantity." }, 400);
        const expectedPrice = item.unitPrice === undefined ? undefined : nonNegativeNumber(item.unitPrice);
        if (expectedPrice !== undefined && !Number.isFinite(expectedPrice)) return json({ error: "Invalid product price." }, 400);
        items.push({ productId, quantity, expectedPrice });
        requested.set(productId, (requested.get(productId) || 0) + quantity);
    }

    const productIds = [...requested.keys()].sort((a, b) => a - b);
    const placeholders = productIds.map(() => "?").join(",");
    const result = await env.DB.prepare(
        `SELECT product_id, product_name, unit, selling_price, current_stock FROM products WHERE is_active = 1 AND product_id IN (${placeholders}) ORDER BY product_id${env.DB.lockRows ? " FOR UPDATE" : ""}`,
    ).bind(...productIds).all();
    const productMap = new Map(result.results.map((product) => [product.product_id, product]));
    for (const [productId, quantity] of requested) {
        const product = productMap.get(productId);
        if (!product || Number(product.current_stock) < quantity) {
            return json({ error: "Insufficient stock or invalid product." }, 400);
        }
    }
    if (items.some((item) => item.expectedPrice !== undefined && item.expectedPrice !== Number(productMap.get(item.productId).selling_price))) {
        return json({ error: "Product prices changed. Review the updated total before completing this sale.", code: "PRICE_CHANGED" }, 409);
    }

    const saleId = crypto.randomUUID();
    const transactionCode = `GF-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const totalCents = items.reduce((sum, item) => sum + lineTotalCents(item.quantity, Number(productMap.get(item.productId).selling_price)), 0n);
    if (totalCents > 100_000_000_000n) {
        return json({ error: "Sale total cannot exceed PHP 1,000,000,000." }, 400);
    }
    const total = Number(totalCents) / 100;
    const statements = [env.DB.prepare(
        "INSERT INTO sales (sale_id, transaction_code, customer_id, cashier_id, subtotal, total_amount, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(saleId, transactionCode, customerId, user.user_id, total, total, paymentMethod)];

    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
        const product = productMap.get(item.productId);
        statements.push(env.DB.prepare(
            "INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, product_name, unit) VALUES (?, ?, ?, ?, ?, ?)",
        ).bind(saleId, item.productId, item.quantity, product.selling_price, product.product_name, product.unit));
        statements.push(env.DB.prepare(
            "UPDATE products SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?",
        ).bind(item.quantity, item.productId));
    }
    if (payloadHash) statements.push(env.DB.prepare("INSERT INTO sale_requests (request_id, user_id, sale_id, payload_hash) VALUES (?, ?, ?, ?)").bind(body.requestId, user.user_id, saleId, payloadHash));

    try {
        await env.DB.batch(statements);
    } catch (error) {
        if (error.code === "23503" || String(error.message).includes("FOREIGN KEY constraint failed")) {
            return json({ error: "The selected customer is no longer available." }, 400);
        }
        if (error.code === "23514" || String(error.message).includes("CHECK constraint failed")) {
            return json({ error: "Insufficient stock or invalid product." }, 400);
        }
        throw error;
    }
    return json({ saleId, transactionCode, total, items: items.map((item) => ({ ...item, name: productMap.get(item.productId).product_name, price: Number(productMap.get(item.productId).selling_price) })) }, 201);
}

async function inventory(env) {
    const result = await env.DB.prepare(
        "SELECT * FROM inventory_status ORDER BY product_name",
    ).all();
    return json(result.results);
}

async function stockIn(request, env, user) {
    const body = await readBody(request);
    const productId = positiveInteger(body.productId);
    const quantity = positiveNumber(body.quantity);
    const unitCost = body.unitCost === undefined || body.unitCost === "" ? 0 : nonNegativeNumber(body.unitCost);
    const supplierId = body.supplierId ? positiveInteger(body.supplierId) : null;
    if (!productId || !quantity || quantity > 1_000_000 || !Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000_000 || (body.supplierId && !supplierId)) {
        return json({ error: "Select a valid product and enter a positive quantity and non-negative unit cost." }, 400);
    }
    const product = await env.DB.prepare(
        `SELECT product_id FROM products WHERE product_id = ? AND is_active = 1${env.DB.lockRows ? " FOR UPDATE" : ""}`,
    ).bind(productId).first();
    if (!product) return json({ error: "The selected product is not active." }, 404);
    if (supplierId) {
        const supplier = await env.DB.prepare(
            "SELECT supplier_id FROM suppliers WHERE supplier_id = ? AND status = 'Active'",
        ).bind(supplierId).first();
        if (!supplier) return json({ error: "The selected supplier is not active." }, 400);
    }

    const referenceNumber = body.referenceNumber ? String(body.referenceNumber).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;
    if ((referenceNumber && referenceNumber.length > 100) || (notes && notes.length > 500)) {
        return json({ error: "Reference number or notes are too long." }, 400);
    }
    const receiptId = crypto.randomUUID();
    try {
        await env.DB.batch([
            env.DB.prepare(
                "INSERT INTO stock_receipts (stock_receipt_id, supplier_id, received_by, reference_number, notes) VALUES (?, ?, ?, ?, ?)",
            ).bind(receiptId, supplierId, user.user_id, referenceNumber, notes),
            env.DB.prepare(
                "INSERT INTO stock_receipt_items (stock_receipt_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)",
            ).bind(receiptId, productId, quantity, unitCost),
            env.DB.prepare(
                "UPDATE products SET current_stock = current_stock + ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ? AND is_active = 1",
            ).bind(quantity, productId),
        ]);
    } catch (error) {
        if (error.code === "23503" || String(error.message).includes("FOREIGN KEY constraint failed")) return json({ error: "Selected product or supplier does not exist." }, 400);
        throw error;
    }
    return json({ receiptId }, 201);
}

async function suppliers(env) {
    const result = await env.DB.prepare(
        "SELECT supplier_id, supplier_code, supplier_name, contact_person, contact_number, status FROM suppliers ORDER BY supplier_name",
    ).all();
    return json(result.results);
}

async function createSupplier(request, env) {
    const body = await readBody(request);
    if (!hasFields(body, ["supplierName", "contactPerson", "contactNumber"])) {
        return json({ error: "Supplier name and contact details are required." }, 400);
    }
    const fields = [String(body.supplierName).trim(), String(body.contactPerson).trim(), String(body.contactNumber).trim()];
    if (fields.some((value, index) => !value || value.length > [120, 120, 40][index])) {
        return json({ error: "Enter valid supplier details." }, 400);
    }
    const code = makeCode("S");
    const result = await env.DB.prepare(
        "INSERT INTO suppliers (supplier_code, supplier_name, contact_person, contact_number) VALUES (?, ?, ?, ?)",
    ).bind(code, ...fields).run();
    return json({ supplierId: result.meta.last_row_id, supplierCode: code }, 201);
}

async function reportSummary(env) {
    const [stats, daily, recent] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS total_products, SUM(CASE WHEN current_stock > minimum_stock THEN 1 ELSE 0 END) AS available_products, SUM(CASE WHEN current_stock > 0 AND current_stock <= minimum_stock THEN 1 ELSE 0 END) AS low_stock_products, SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) AS out_of_stock_products FROM products WHERE is_active = 1").first(),
        env.DB.prepare("SELECT COALESCE(SUM(total_amount), 0) AS sales_total, COUNT(*) AS transaction_count FROM sales WHERE status = 'Completed' AND date(sold_at, '+8 hours') = date('now', '+8 hours')").first(),
        env.DB.prepare("SELECT s.transaction_code, COALESCE(c.full_name, 'Walk-in Customer') AS customer_name, s.total_amount, s.status, strftime('%Y-%m-%dT%H:%M:%SZ', s.sold_at) AS sold_at FROM sales s LEFT JOIN customers c ON c.customer_id = s.customer_id ORDER BY s.sold_at DESC LIMIT 5").all(),
    ]);
    return json({
        ...stats,
        sales_total: Number(daily.sales_total),
        transaction_count: daily.transaction_count,
        recent_sales: recent.results,
    });
}

async function saleDetail(env, user, saleId) {
    const sale = await env.DB.prepare("SELECT s.*, COALESCE(c.full_name, 'Walk-in customer') AS customer_name, u.username AS cashier_name, strftime('%Y-%m-%dT%H:%M:%SZ', s.sold_at) AS sold_at_iso FROM sales s LEFT JOIN customers c ON c.customer_id = s.customer_id JOIN users u ON u.user_id = s.cashier_id WHERE s.sale_id = ?").bind(saleId).first();
    if (!sale || (user.role === "Cashier" && sale.cashier_id !== user.user_id)) return json({ error: "Sale not found." }, 404);
    const rows = await env.DB.prepare("SELECT product_id, product_name, unit, quantity, unit_price FROM sale_items WHERE sale_id = ? ORDER BY sale_item_id").bind(saleId).all();
    return json({ saleId: sale.sale_id, transactionCode: sale.transaction_code, total: Number(sale.total_amount), customerName: sale.customer_name, cashierName: sale.cashier_name, paymentMethod: sale.payment_method, status: sale.status, soldAt: sale.sold_at_iso, voidReason: sale.void_reason, items: rows.results.map((item) => ({ productId: item.product_id, name: item.product_name, unit: item.unit, quantity: Number(item.quantity), price: Number(item.unit_price) })) });
}

async function voidSale(request, env, user, saleId) {
    const body = await readBody(request);
    const reason = String(body.reason || "").trim();
    if (reason.length < 3 || reason.length > 500) return json({ error: "Enter a void reason between 3 and 500 characters." }, 400);
    const sale = await env.DB.prepare(`SELECT status FROM sales WHERE sale_id = ?${env.DB.lockRows ? " FOR UPDATE" : ""}`).bind(saleId).first();
    if (!sale) return json({ error: "Sale not found." }, 404);
    if (sale.status === "Voided") return json({ error: "This sale has already been voided." }, 409);
    const items = await env.DB.prepare("SELECT product_id, quantity FROM sale_items WHERE sale_id = ? ORDER BY product_id").bind(saleId).all();
    await env.DB.batch([
        env.DB.prepare("UPDATE sales SET status = 'Voided', void_reason = ?, voided_by = ?, voided_at = CURRENT_TIMESTAMP WHERE sale_id = ?").bind(reason, user.user_id, saleId),
        ...items.results.map((item) => env.DB.prepare("UPDATE products SET current_stock = current_stock + ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").bind(item.quantity, item.product_id)),
    ]);
    return json({ message: "Sale voided and stock restored." });
}

async function updateUser(request, env, user, id) {
    const body = await readBody(request);
    const target = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(Number(id)).first();
    if (!target) return json({ error: "Account not found." }, 404);
    const role = body.role ?? target.role;
    const active = body.isActive === undefined ? target.is_active : body.isActive === true ? 1 : body.isActive === false ? 0 : -1;
    if (!ROLES.includes(role) || ![0, 1].includes(active)) return json({ error: "Invalid role or account status." }, 400);
    if (user.user_id === target.user_id && (active === 0 || role !== user.role)) return json({ error: "You cannot disable or change the role of your own account." }, 400);
    if (target.role === "Owner / Manager" && target.is_active === 1 && (role !== target.role || active === 0)) {
        const owners = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'Owner / Manager' AND is_active = 1").first();
        if (Number(owners.count) <= 1) return json({ error: "At least one active owner is required." }, 400);
    }
    const statements = [env.DB.prepare("UPDATE users SET role = ?, is_active = ? WHERE user_id = ?").bind(role, active, target.user_id)];
    if (body.password !== undefined) {
        if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 256) return json({ error: "Password must be between 8 and 256 characters." }, 400);
        statements.push(env.DB.prepare("UPDATE users SET password_hash = ? WHERE user_id = ?").bind(await hashPassword(body.password), target.user_id));
    }
    statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target.user_id));
    await env.DB.batch(statements);
    return json({ message: "Account updated. The user must sign in again." });
}

async function changePassword(request, env, user) {
    const body = await readBody(request);
    if (typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 256) return json({ error: "New password must be between 8 and 256 characters." }, 400);
    const account = await env.DB.prepare("SELECT password_hash FROM users WHERE user_id = ?").bind(user.user_id).first();
    if (!(await verifyPassword(String(body.currentPassword || ""), account.password_hash))) return json({ error: "Current password is incorrect." }, 400);
    await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash = ? WHERE user_id = ?").bind(await hashPassword(body.newPassword), user.user_id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.user_id),
    ]);
    return json({ message: "Password changed. Sign in again." }, 200, { "set-cookie": sessionCookie("", request, 0) });
}

async function updateContact(request, env, kind, id) {
    const body = await readBody(request);
    if (kind === "customers") {
        const name = String(body.fullName || "").trim();
        const phone = String(body.contactNumber || "").trim();
        if (!name || name.length > 120 || !phone || phone.length > 40) return json({ error: "Enter a customer name and contact number." }, 400);
        const result = await env.DB.prepare("UPDATE customers SET full_name = ?, contact_number = ? WHERE customer_id = ?").bind(name, phone, Number(id)).run();
        return result.meta.changes ? json({ message: "Customer updated." }) : json({ error: "Customer not found." }, 404);
    }
    const fields = [String(body.supplierName || "").trim(), String(body.contactPerson || "").trim(), String(body.contactNumber || "").trim(), body.status || "Active"];
    if (fields.some((value, index) => !value || value.length > [120, 120, 40, 8][index]) || !["Active", "Inactive"].includes(fields[3])) return json({ error: "Enter valid supplier details." }, 400);
    const result = await env.DB.prepare("UPDATE suppliers SET supplier_name = ?, contact_person = ?, contact_number = ?, status = ? WHERE supplier_id = ?").bind(...fields, Number(id)).run();
    return result.meta.changes ? json({ message: "Supplier updated." }) : json({ error: "Supplier not found." }, 404);
}

export async function onRequest({ request, env }) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
    const method = request.method.toUpperCase();
    if (path === "logout" && method === "POST") return await logout(request, env);
    if (!env.DB) return json({ error: "The database is not configured." }, 500);
    try {
        if (path === "setup-status" && method === "GET") {
            const result = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
            return json({ ownerSetupAvailable: Number(result.count) === 0, setupTokenRequired: Boolean(env.OWNER_SETUP_TOKEN) });
        }
        if (path === "login" && method === "POST") return await login(request, env);
        if (path === "session" && method === "GET") {
            const user = await getSession(request, env);
            return json({ user: user ? { userId: user.user_id, username: user.username, role: user.role } : null }, 200, { "cache-control": "no-store" });
        }
        if (path === "register" && method === "POST") return await register(request, env);

        const saleMatch = path.match(/^sales\/([a-f0-9-]{36})(\/void)?$/i);
        if (saleMatch && ((method === "GET" && !saleMatch[2]) || (method === "POST" && saleMatch[2]))) {
            const user = await requireRole(request, env, method === "GET" ? ["Owner / Manager", "Cashier"] : ["Owner / Manager"]);
            if (user instanceof Response) return user;
            return method === "GET" ? await saleDetail(env, user, saleMatch[1]) : await voidSale(request, env, user, saleMatch[1]);
        }
        if (path === "account/password" && method === "POST") {
            const user = await requireRole(request, env, ROLES);
            return user instanceof Response ? user : await changePassword(request, env, user);
        }
        const userMatch = path.match(/^users\/(\d+)$/);
        if (userMatch && method === "PATCH") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await updateUser(request, env, user, userMatch[1]);
        }
        const contactMatch = path.match(/^(customers|suppliers)\/(\d+)$/);
        if (contactMatch && method === "PATCH") {
            const user = await requireRole(request, env, contactMatch[1] === "customers" ? ["Owner / Manager", "Cashier"] : ["Owner / Manager"]);
            return user instanceof Response ? user : await updateContact(request, env, contactMatch[1], contactMatch[2]);
        }
        if (path === "stock-receipts" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager", "Store Clerk"]);
            if (user instanceof Response) return user;
            const offset = Number(url.searchParams.get("offset") || 0);
            if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Invalid page." }, 400);
            const result = await env.DB.prepare(`SELECT r.stock_receipt_id, r.reference_number, r.notes, strftime('%Y-%m-%dT%H:%M:%SZ', r.received_at) AS received_at, COALESCE(s.supplier_name, 'No supplier') AS supplier_name, u.username AS received_by, p.product_name, i.quantity, p.unit, i.unit_cost FROM stock_receipts r JOIN stock_receipt_items i ON i.stock_receipt_id = r.stock_receipt_id JOIN products p ON p.product_id = i.product_id LEFT JOIN suppliers s ON s.supplier_id = r.supplier_id JOIN users u ON u.user_id = r.received_by ORDER BY r.received_at DESC, r.stock_receipt_id DESC LIMIT 100 OFFSET ${offset}`).all();
            return json(result.results);
        }

        const productMatch = path.match(/^products\/(\d+)$/);
        if (productMatch && method === "DELETE") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            if (user instanceof Response) return user;
            const product = await env.DB.prepare(`SELECT current_stock FROM products WHERE product_id = ? AND is_active = 1${env.DB.lockRows ? " FOR UPDATE" : ""}`).bind(Number(productMatch[1])).first();
            if (!product) return json({ error: "Product not found." }, 404);
            if (Number(product.current_stock) !== 0) return json({ error: "Only products with zero stock can be archived." }, 400);
            await env.DB.prepare("UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?").bind(Number(productMatch[1])).run();
            return json({ message: "Product archived. Its transaction history is preserved." });
        }
        if (path === "products" && method === "GET") {
            const user = await requireRole(request, env, ROLES);
            return user instanceof Response ? user : await products(env);
        }
        if (path === "products" && method === "POST") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await createProduct(request, env);
        }
        if (productMatch && method === "PATCH") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await updateProduct(request, env, productMatch[1]);
        }
        if (path === "users" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await users(env);
        }
        if (path === "customers" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager", "Cashier"]);
            return user instanceof Response ? user : await customers(env);
        }
        if (path === "customers" && method === "POST") {
            const user = await requireRole(request, env, ["Owner / Manager", "Cashier"]);
            return user instanceof Response ? user : await createCustomer(request, env);
        }
        if (path === "sales" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager", "Cashier"]);
            if (user instanceof Response) return user;
            const dateFrom = url.searchParams.get("from");
            const dateTo = url.searchParams.get("to");
            if (!validDate(dateFrom) || !validDate(dateTo) || (dateFrom && dateTo && dateFrom > dateTo)) {
                return json({ error: "Enter a valid date range." }, 400);
            }
            const offset = Number(url.searchParams.get("offset") || 0);
            if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Invalid page." }, 400);
            return await sales(env, user, dateFrom, dateTo, offset);
        }
        if (path === "sales" && method === "POST") {
            const user = await requireRole(request, env, ["Owner / Manager", "Cashier"]);
            return user instanceof Response ? user : await createSale(request, env, user);
        }
        if (path === "inventory" && method === "GET") {
            const user = await requireRole(request, env, ROLES);
            return user instanceof Response ? user : await inventory(env);
        }
        if (path === "stock-in" && method === "POST") {
            const user = await requireRole(request, env, ["Owner / Manager", "Store Clerk"]);
            return user instanceof Response ? user : await stockIn(request, env, user);
        }
        if (path === "suppliers" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager", "Store Clerk"]);
            return user instanceof Response ? user : await suppliers(env);
        }
        if (path === "suppliers" && method === "POST") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await createSupplier(request, env);
        }
        if (path === "reports/summary" && method === "GET") {
            const user = await requireRole(request, env, ["Owner / Manager"]);
            return user instanceof Response ? user : await reportSummary(env);
        }
        return json({ error: "Not found." }, 404);
    } catch (error) {
        return internalError(error);
    }
}
