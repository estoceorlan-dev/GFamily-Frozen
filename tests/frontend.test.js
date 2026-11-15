import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const script = await readFile(new URL("../project.js", import.meta.url), "utf8");
const products = [{ product_id: 1, product_code: "P001", product_name: "Chicken", category: "Frozen", unit: "kg", selling_price: 10.01, current_stock: 2.5, minimum_stock: 1 }];

async function dashboard(file, role, customFetch) {
    const calls = [], errors = [];
    const html = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const console = new VirtualConsole();
    console.on("jsdomError", (error) => errors.push(error));
    const dom = new JSDOM(html, { url: `https://store.example/${file}`, runScripts: "dangerously", virtualConsole: console });
    const { window } = dom;
    window.AbortSignal = AbortSignal;
    window.fetch = async (url, options) => {
        calls.push({ url, options });
        if (customFetch) { const response = await customFetch(url, options); if (response) return response; }
        const data = {
            "/api/session": { user: role ? { userId: 1, username: "tester", role } : null },
            "/api/setup-status": { ownerSetupAvailable: true, setupTokenRequired: true },
            "/api/products": products,
            "/api/inventory": products.map((product) => ({ ...product, stock_status: "Available" })),
            "/api/customers": [{ customer_id: 1, customer_code: "C001", full_name: "Test Customer", contact_number: "09000000000", total_purchases: 0 }],
            "/api/suppliers": [{ supplier_id: 1, supplier_code: "S001", supplier_name: "Test Supplier", contact_person: "Test Contact", contact_number: "09000000000", status: "Active" }],
            "/api/users": [{ user_id: 1, username: "tester", role: "Owner / Manager", is_active: 1, created_at: "2026-11-14T00:00:00Z" }],
            "/api/reports/summary": { total_products: 1, low_stock_products: 0, sales_total: 0, transaction_count: 0, recent_sales: [] },
        };
        const value = url.startsWith("/api/sales") || url.startsWith("/api/stock-receipts") ? [] : data[url];
        if (value === undefined) throw new Error(`Unexpected API request: ${url}`);
        return new Response(JSON.stringify(value), { status: 200 });
    };
    window.eval(script);
    await new Promise((done) => window.addEventListener("load", () => setTimeout(done, 40), { once: true }));
    return { dom, window, document: window.document, calls, errors };
}

test("all dashboards load without script errors and obey role-specific data access", async (t) => {
    for (const [file, role] of [["admindashboard.html", "Owner / Manager"], ["casher.html", "Cashier"], ["clerk.html", "Store Clerk"]]) {
        await t.test(role, async () => {
            const app = await dashboard(file, role);
            try {
                assert.deepEqual(app.errors, []);
                assert.equal(app.document.getElementById("currentUser").textContent, "tester");
                assert.equal(app.document.getElementById("appMessage").hidden, true);
                assert.equal(app.document.querySelectorAll('script[type="text/plain"]').length, 0);
                const ids = [...app.document.querySelectorAll("[id]")].map((element) => element.id);
                assert.equal(new Set(ids).size, ids.length, "IDs must be unique");
                app.window.toggleSidebar(true);
                assert.equal(app.document.getElementById("menuToggle").getAttribute("aria-expanded"), "true");
                assert.equal(app.document.getElementById("navBackdrop").hidden, false);
                assert.equal(app.document.getElementById("mainContent").inert, true);
                const nextPage = role === "Cashier" ? "customers" : "products";
                app.window.showPage(nextPage);
                assert.equal(app.document.getElementById("navBackdrop").hidden, true);
                assert.equal(app.document.getElementById("mainContent").inert, false);
                assert.equal(app.document.querySelector('[aria-current="page"]').dataset.page, nextPage);
                if (role === "Cashier") {
                    assert.ok(!app.calls.some((call) => call.url.includes("reports") || call.url.includes("suppliers") || call.url.includes("stock-receipts")));
                    assert.equal(app.document.querySelectorAll("#customerRows tr td").length, 5);
                }
                if (role === "Store Clerk") {
                    assert.ok(!app.calls.some((call) => call.url.includes("sales") || call.url.includes("customers") || call.url.includes("reports")));
                    app.window.stockIn();
                    await new Promise((done) => setTimeout(done, 10));
                    assert.equal(app.document.querySelector("#modalForm [name=productId]").value, "1");
                }
                if (role === "Owner / Manager") {
                    app.window.addStaffUser();
                    assert.equal(app.document.querySelector("#modalForm [name=role]").value, "Cashier");
                    app.window.showPage("reports");
                    assert.ok(app.document.getElementById("reports").classList.contains("active"));
                }
            } finally { app.dom.window.close(); }
        });
    }
});

test("catalog search and category filters work together without changing the cart", async () => {
    const app = await dashboard("casher.html", "Cashier", async (url) => {
        if (url === "/api/products") return new Response(JSON.stringify([...products, { ...products[0], product_id: 2, product_code: "P002", product_name: "Fish Fillet", category: "Seafood" }]));
    });
    try {
        app.window.addToCart(1);
        const filters = [...app.document.querySelectorAll(".category-filter")];
        filters.find((button) => button.textContent === "Frozen").click();
        assert.equal(app.document.querySelectorAll('.product-card:not([hidden])').length, 1);
        const input = app.document.getElementById("productSearch");
        input.value = "fish";
        input.dispatchEvent(new app.window.Event("input"));
        assert.equal(app.document.getElementById("productSearchEmpty").hidden, false);
        filters.find((button) => button.textContent === "All").click();
        assert.equal(app.document.getElementById("productSearchEmpty").hidden, true);
        assert.equal(app.document.querySelectorAll('.product-card:not([hidden])').length, 1);
        assert.match(app.document.getElementById("cartItems").textContent, /Chicken/);
        assert.equal(app.document.getElementById("cartCount").textContent, "1");
    } finally { app.dom.window.close(); }
});

test("owner setup shows its token field and toggles password visibility", async () => {
    const app = await dashboard("admindashboard.html", null);
    try {
        app.window.toggleAuthMode();
        assert.equal(app.document.getElementById("setupTokenGroup").style.display, "block");
        assert.equal(app.document.getElementById("role"), null);
        const input = app.document.getElementById("password");
        input.value = "synthetic-password";
        input.dispatchEvent(new app.window.Event("input"));
        const toggle = app.document.querySelector('[data-password-toggle="password"]');
        assert.equal(toggle.hidden, false);
        toggle.click();
        assert.equal(input.type, "text");
        assert.equal(toggle.getAttribute("aria-pressed"), "true");
    } finally { app.dom.window.close(); }
});

test("sign out requires confirmation and product fields use saved options", async () => {
    const app = await dashboard("admindashboard.html", "Owner / Manager", async (url) => {
        if (url === "/api/product-options") {
            return new Response(JSON.stringify({ categories: ["Frozen", "Seafood"], units: ["kg", "pack"] }));
        }
    });
    try {
        app.window.confirmLogout();
        assert.ok(app.document.getElementById("modalOverlay").classList.contains("show"));
        assert.equal(app.document.getElementById("modalTitle").textContent, "Sign out?");
        assert.equal(app.document.querySelector('#modalForm button[type="submit"]').textContent, "Sign out");
        assert.ok(!app.calls.some((call) => call.url === "/api/logout"));
        app.window.closeModal();

        await app.window.addProduct();
        const category = app.document.querySelector('#modalForm [name="category"]');
        const unit = app.document.querySelector('#modalForm [name="unit"]');
        assert.equal(category.tagName, "SELECT");
        assert.deepEqual([...category.options].map((option) => option.textContent), ["Select category", "Frozen", "Seafood"]);
        assert.equal(unit.tagName, "SELECT");
        assert.deepEqual([...unit.options].map((option) => option.textContent), ["Select unit", "kg", "pack"]);
    } finally { app.dom.window.close(); }
});

test("fractional cart, double-click checkout protection, server receipt values, and cashier refresh", async () => {
    let releaseSale;
    const salePending = new Promise((done) => { releaseSale = done; });
    const app = await dashboard("casher.html", "Cashier", async (url, options) => {
        if (url === "/api/sales" && options.method === "POST") {
            await salePending;
            return new Response(JSON.stringify({ saleId: "fake", transactionCode: "GF-TEST", total: 5.01, items: [{ productId: 1, name: "Chicken", price: 10.01, quantity: 0.5, unit: "kg" }] }), { status: 201 });
        }
    });
    try {
        app.window.addToCart(1);
        const input = app.document.querySelector(".cart-quantity");
        input.value = "0.5";
        input.dispatchEvent(new app.window.Event("change"));
        assert.match(app.document.getElementById("cartTotal").textContent, /5\.01/);
        const first = app.window.checkout();
        const second = app.window.checkout();
        assert.equal(app.calls.filter((call) => call.url === "/api/sales").length, 1);
        assert.equal(app.document.querySelector('[onclick="checkout()"]').disabled, true);
        releaseSale();
        await Promise.all([first, second]);
        assert.ok(app.document.getElementById("receiptOverlay").classList.contains("show"));
        assert.match(app.document.getElementById("receiptContent").textContent, /GF-TEST/);
        assert.match(app.document.getElementById("cartItems").textContent, /No products/);
        assert.ok(!app.calls.some((call) => call.url === "/api/reports/summary"));
        assert.deepEqual(app.errors, []);
    } finally { app.dom.window.close(); }
});

test("checkout requires review after a price change and keeps the order", async () => {
    let productReads = 0, saleWrites = 0;
    const app = await dashboard("casher.html", "Cashier", async (url, options) => {
        if (url === "/api/products") return new Response(JSON.stringify([{ ...products[0], selling_price: ++productReads === 1 ? 10.01 : 12 }]));
        if (url === "/api/sales" && options.method === "POST") {
            saleWrites++;
            return new Response(JSON.stringify({ error: "Review the updated total.", code: "PRICE_CHANGED" }), { status: 409 });
        }
    });
    try {
        app.window.addToCart(1);
        await app.window.checkout();
        assert.equal(saleWrites, 1);
        assert.match(app.document.getElementById("cartTotal").textContent, /12\.00/);
        assert.equal(app.document.getElementById("receiptOverlay").classList.contains("show"), false);
        assert.equal(app.document.querySelector('[onclick="checkout()"]').disabled, false);
    } finally { app.dom.window.close(); }
});

test("failed form submissions keep the modal open and show an accessible error", async () => {
    const app = await dashboard("admindashboard.html", "Owner / Manager", async (url, options) => {
        if (url === "/api/register" && options.method === "POST") return new Response(JSON.stringify({ error: "That username is already registered." }), { status: 409 });
    });
    try {
        app.window.addStaffUser();
        const form = app.document.getElementById("modalForm");
        form.elements.username.value = "cashier";
        form.elements.password.value = "synthetic-password";
        await form.onsubmit(new app.window.Event("submit", { cancelable: true }));
        assert.equal(app.document.querySelector(".modal-error").hidden, false);
        assert.match(app.document.querySelector(".modal-error").textContent, /already registered/);
        assert.ok(app.document.getElementById("modalOverlay").classList.contains("show"));
        assert.equal(form.querySelector('[type="submit"]').disabled, false);
    } finally { app.dom.window.close(); }
});
