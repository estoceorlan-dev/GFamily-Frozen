let currentSession = null;
let productCatalog = [];
let cart = [];
let authMode = "login";
let checkingOut = false;
let saleRequestId = null;
let salesOffset = 0;
let receiptOffset = 0;
let productCategory = "All";

function uiIcon(name, className = "size-4") {
    const paths = {
        box: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
    };
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.box}</svg>`;
}

const LOCAL_SERVER_MESSAGE = "Start this app with npm run dev, then open http://localhost:8790.";
const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
const lineAmount = (quantity, price) => Number((BigInt(Math.round(quantity * 100)) * BigInt(Math.round(price * 100)) + 50n) / 100n) / 100;
const localTime = (value) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

async function apiRequest(url, options = {}) {
    if (window.location.protocol === "file:") {
        throw new Error(LOCAL_SERVER_MESSAGE);
    }
    let response;
    try { response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        signal: options.signal || AbortSignal.timeout(90_000),
    }); } catch { throw new Error("Could not reach the service. It may be waking up. Please try again shortly."); }
    const data = await response.json().catch(() => null);
    if (response.status === 401 && currentSession) { currentSession = null; window.location.replace("admindashboard.html"); }
    if (!response.ok || data === null) { const error = new Error(data?.error || "The service is starting or unavailable. Please try again shortly."); error.code = data?.code; throw error; }
    return data;
}

function dashboardPath(role) {
    if (role === "Cashier") return "cashier.html";
    if (role === "Store Clerk") return "clerk.html";
    return "admindashboard.html";
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

function showMessage(message) {
    const notification = document.getElementById("appMessage");
    if (notification && currentSession) {
        notification.textContent = message;
        notification.hidden = false;
        window.clearTimeout(notification.hideTimer);
        notification.hideTimer = window.setTimeout(() => { notification.hidden = true; }, 7000);
        return;
    }
    const element = document.getElementById("authMessage");
    if (element) element.textContent = message;
    else alert(message);
}

async function login() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    if (!username || !password) return showMessage("Enter your username and password.");

    try {
        currentSession = await apiRequest("/api/login", {
            method: "POST",
            body: JSON.stringify({ username, password, role }),
        });
        window.location.href = dashboardPath(currentSession.role);
    } catch (error) {
        showMessage(error.message);
    }
}

function setAuthMode(mode) {
    authMode = mode;
    const registering = authMode === "register";
    document.getElementById("authButton").textContent = registering ? "Create account" : "Sign in";
    document.getElementById("authToggleText").textContent = registering ? "Back to sign in" : "Set up store";
    document.getElementById("authTitle").textContent = registering ? "Set up your store" : "Sign in";
    document.getElementById("confirmPasswordGroup").style.display = registering ? "block" : "none";
    document.getElementById("confirmPassword").required = registering;
    document.getElementById("setupTokenGroup")?.style.setProperty("display", registering && window.setupTokenRequired ? "block" : "none");
    document.getElementById("password").autocomplete = registering ? "new-password" : "current-password";
    const role = document.getElementById("role");
    role.value = "Owner / Manager";
    role.disabled = registering;
    showMessage(registering ? "Create your owner account." : "");
}

function toggleAuthMode() {
    const toggle = document.getElementById("authToggle");
    if (!toggle || toggle.hidden) return;
    setAuthMode(authMode === "login" ? "register" : "login");
}

async function register() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    if (username.length < 3) return showMessage("Username must be at least 3 characters.");
    if (password.length < 8) return showMessage("Password must be at least 8 characters.");
    if (password !== confirmPassword) return showMessage("Passwords do not match.");
    try {
        await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify({ username, password, role: "Owner / Manager", setupToken: document.getElementById("setupToken")?.value }),
        });
        document.getElementById("password").value = "";
        document.getElementById("confirmPassword").value = "";
        setAuthMode("login");
        document.getElementById("authToggle").hidden = true;
        showMessage("Owner account created. Sign in with your new credentials.");
    } catch (error) {
        showMessage(error.message);
    }
}

async function logout() {
    const button = document.querySelector(".logout button");
    if (button) button.disabled = true;
    try { await apiRequest("/api/logout", { method: "POST", body: "{}" }); currentSession = null; window.location.replace("admindashboard.html"); }
    catch (error) { showMessage(error.message); if (button) button.disabled = false; }
}

function toggleSidebar(force) {
    const wasOpen = document.body.classList.contains("nav-open");
    const open = force === undefined ? !wasOpen : force;
    document.body.classList.toggle("nav-open", open);
    document.getElementById("menuToggle")?.setAttribute("aria-expanded", String(open));
    const backdrop = document.getElementById("navBackdrop");
    if (backdrop) backdrop.hidden = !open;
    const sidebar = document.getElementById("appSidebar");
    const main = document.getElementById("mainContent");
    if (main) main.inert = open;
    if (open) sidebar?.querySelector(".menu button.active")?.focus();
    else if (wasOpen) document.getElementById("menuToggle")?.focus();
}

function showPage(pageId, button) {
    const page = document.getElementById(pageId);
    if (!page) return;
    document.querySelectorAll(".page").forEach((item) => item.classList.toggle("active", item === page));
    const activeButton = button || document.querySelector(`.menu button[data-page="${pageId}"]`);
    document.querySelectorAll(".menu button").forEach((item) => {
        item.classList.toggle("active", item === activeButton);
        if (item === activeButton) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });
    const heading = document.getElementById("pageHeading");
    if (heading) heading.textContent = page.querySelector("h1")?.textContent || pageId;
    toggleSidebar(false);
    document.documentElement.scrollTop = 0;
}

function addToCart(productOrName, price) {
    if (checkingOut) return;
    const product = typeof productOrName === "number" || /^\d+$/.test(String(productOrName))
        ? productCatalog.find((item) => Number(item.product_id) === Number(productOrName))
        : productCatalog.find((item) => item.product_name === productOrName);
    if (!product) return showMessage("This product is no longer available. Refresh the page and try again.");
    if (Number(product.current_stock) <= 0) return showMessage("This product is out of stock.");
    const item = cart.find((entry) => entry.productId === product.product_id);
    if (item) {
        if (item.quantity + 1 > Number(product.current_stock)) return showMessage("There is not enough stock for that quantity.");
        item.quantity++;
    } else {
        cart.push({
            productId: product.product_id,
            name: product.product_name,
            price: Number(product.selling_price),
            quantity: Math.min(1, Number(product.current_stock)),
            unit: product.unit,
        });
    }
    saleRequestId = null;
    updateCart();
}

function updateCart() {
    const container = document.getElementById("cartItems");
    if (!container) return;
    const total = cart.reduce((sum, item) => sum + Math.round(lineAmount(item.quantity, item.price) * 100), 0) / 100;
    if (!cart.length) {
        container.innerHTML = '<p class="empty-state">No products added.</p>';
    } else {
        container.innerHTML = cart.map((item, index) => `
            <div class="cart-item">
                <div><strong>${escapeHtml(item.name)}</strong><small>${money(item.price)} / ${escapeHtml(item.unit)}</small><label>Qty <input aria-label="Quantity for ${escapeHtml(item.name)} (${escapeHtml(item.unit)})" class="cart-quantity" type="number" min="0.01" max="1000000" step="0.01" value="${item.quantity}" onchange="changeQuantity(${index}, this)" ${checkingOut ? "disabled" : ""}> ${escapeHtml(item.unit)}</label></div>
                <div class="text-right"><strong>${money(lineAmount(item.quantity, item.price))}</strong><br><button class="btn btn-danger" type="button" onclick="removeItem(${index})" aria-label="Remove ${escapeHtml(item.name)}" ${checkingOut ? "disabled" : ""}>${uiIcon("close", "size-3")}</button></div>
            </div>`).join("");
    }
    document.getElementById("cartTotal").textContent = money(total);
    const cartCount = document.getElementById("cartCount");
    if (cartCount) cartCount.textContent = cart.length;
    const checkoutButton = document.querySelector('[onclick="checkout()"]');
    if (checkoutButton) { checkoutButton.disabled = checkingOut || !cart.length; checkoutButton.textContent = checkingOut ? "Saving…" : "Complete sale"; }
    document.querySelectorAll("#saleCustomer, #paymentMethod").forEach((element) => { element.disabled = checkingOut; });
}

function removeItem(index) {
    if (checkingOut) return;
    if (!Number.isInteger(index) || index < 0 || index >= cart.length) return;
    cart.splice(index, 1);
    saleRequestId = null;
    updateCart();
}

async function checkout() {
    if (checkingOut) return;
    if (!cart.length) return showMessage("Add at least one product before completing a sale.");
    const soldItems = cart.map((item) => ({ ...item }));
    const customer = document.getElementById("saleCustomer");
    const customerName = customer?.selectedOptions[0]?.textContent || "Walk-in customer";
    const paymentMethod = document.getElementById("paymentMethod")?.value || "Cash";
    checkingOut = true;
    saleRequestId ||= crypto.randomUUID();
    updateCart();
    try {
        const result = await apiRequest("/api/sales", {
            method: "POST",
            body: JSON.stringify({
                customerId: customer?.value || null,
                paymentMethod,
                requestId: saleRequestId,
                items: soldItems.map(({ productId, quantity, price }) => ({ productId, quantity, unitPrice: price })),
            }),
        });
        cart = [];
        saleRequestId = null;
        updateCart();
        showReceipt(result, result.items || soldItems, customerName, paymentMethod);
        showMessage(`Sale ${result.transactionCode} completed. Total: ₱${Number(result.total).toLocaleString()}.`);
        await refreshDashboard();
    } catch (error) {
        if (error.code === "PRICE_CHANGED") {
            try {
                await loadProducts();
                for (const item of cart) {
                    const product = productCatalog.find((product) => product.product_id === item.productId);
                    if (product) item.price = Number(product.selling_price);
                }
                saleRequestId = null;
            } catch { /* Keep the order available for review if the refresh fails. */ }
        }
        showMessage(error.message);
    } finally { checkingOut = false; updateCart(); }
}

function openModal(options) {
    const overlay = document.getElementById("modalOverlay");
    const title = document.getElementById("modalTitle");
    const fields = document.getElementById("modalFields");
    const form = document.getElementById("modalForm");
    if (!overlay || !title || !fields || !form) return;
    title.textContent = options.title;
    fields.replaceChildren();
    const modalError = document.createElement("p");
    modalError.className = "modal-error";
    modalError.setAttribute("role", "alert");
    modalError.hidden = true;
    fields.append(modalError);

    for (const field of options.fields) {
        const group = document.createElement("div");
        group.className = "form-group";
        const label = document.createElement("label");
        label.htmlFor = field.name;
        label.textContent = field.label;
        const input = field.type === "select" ? document.createElement("select") : document.createElement("input");
        input.id = field.name;
        input.name = field.name;
        if (field.type !== "select") input.type = field.type || "text";
        if (field.placeholder) input.placeholder = field.placeholder;
        if (field.required) input.required = true;
        if (field.min !== undefined) input.min = field.min;
        if (field.step !== undefined) input.step = field.step;
        if (field.maxLength) input.maxLength = field.maxLength;
        for (const option of field.options || []) {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            input.append(element);
        }
        input.value = field.value ?? (field.type === "select" ? field.options?.[0]?.value ?? "" : "");
        group.append(label, input);
        fields.append(group);
    }

    form.onsubmit = async (event) => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        modalError.hidden = true;
        try {
            const payload = Object.fromEntries(new FormData(form).entries());
            const succeeded = await options.onSubmit(payload);
            if (succeeded !== false) closeModal();
        } catch (error) {
            modalError.textContent = error.message;
            modalError.hidden = false;
        } finally {
            submit.disabled = false;
        }
    };
    overlay.classList.add("show");
    overlay.returnFocus = document.activeElement;
    form.querySelector("input, select")?.focus();
}

function closeModal() {
    document.getElementById("modalOverlay")?.classList.remove("show");
    document.getElementById("modalOverlay")?.returnFocus?.focus();
}

function showReceipt(sale, items, customerName, paymentMethod) {
    const overlay = document.getElementById("receiptOverlay");
    const content = document.getElementById("receiptContent");
    if (!overlay || !content) return;
    content.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "GFamily Frozen Products";
    const transaction = document.createElement("p");
    transaction.textContent = `Transaction ${sale.transactionCode}`;
    const customer = document.createElement("p");
    customer.textContent = `Customer: ${customerName}`;
    const payment = document.createElement("p");
    payment.textContent = `Payment: ${paymentMethod}`;
    const date = document.createElement("p");
    date.textContent = `${localTime(sale.soldAt || new Date())} · ${sale.status || "Completed"}`;
    const table = document.createElement("table");
    table.innerHTML = "<thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody></tbody>";
    const rows = table.querySelector("tbody");
    for (const item of items) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(item.name)}</td><td>${item.quantity} ${escapeHtml(item.unit)}</td><td>${money(item.price)}</td><td>${money(lineAmount(item.quantity, item.price))}</td>`;
        rows.append(row);
    }
    const total = document.createElement("h3");
    total.textContent = `Total: ₱${Number(sale.total).toLocaleString()}`;
    content.append(heading, transaction, customer, payment, date, table, total);
    if (sale.voidReason) { const reason = document.createElement("p"); reason.textContent = `Void reason: ${sale.voidReason}`; content.append(reason); }
    overlay.classList.add("show");
    overlay.querySelector("button")?.focus();
}

function closeReceipt() {
    document.getElementById("receiptOverlay")?.classList.remove("show");
}

function printReceipt() {
    document.body.classList.add("printing-receipt");
    window.addEventListener("afterprint", () => document.body.classList.remove("printing-receipt"), { once: true });
    window.print();
}

function addProduct() {
    openModal({
        title: "Add Product",
        fields: [
            { name: "productName", label: "Product name", required: true },
            { name: "category", label: "Category", required: true },
            { name: "unit", label: "Unit", value: "unit", required: true },
            { name: "sellingPrice", label: "Selling price (₱)", type: "number", min: "0", step: "0.01", value: "0", required: true },
            { name: "currentStock", label: "Opening stock", type: "number", min: "0", step: "0.01", value: "0", required: true },
            { name: "minimumStock", label: "Low-stock threshold", type: "number", min: "0", step: "0.01", value: "0", required: true },
        ],
        onSubmit: async (data) => {
            await apiRequest("/api/products", { method: "POST", body: JSON.stringify(data) });
            await Promise.all([loadProducts(), loadInventory(), loadDashboardSummary()]);
            showMessage("Product added successfully.");
        },
    });
}

function editProduct(button) {
    const product = productCatalog.find((item) => Number(item.product_id) === Number(button.dataset.productId));
    if (!product) return showMessage("Product not found. Refresh and try again.");
    openModal({
        title: `Edit ${product.product_name}`,
        fields: [
            { name: "productName", label: "Product name", value: product.product_name, required: true },
            { name: "category", label: "Category", value: product.category, required: true },
            { name: "unit", label: "Unit", value: product.unit, required: true },
            { name: "sellingPrice", label: "Selling price (₱)", type: "number", min: "0", step: "0.01", value: product.selling_price, required: true },
            { name: "minimumStock", label: "Low-stock threshold", type: "number", min: "0", step: "0.01", value: product.minimum_stock, required: true },
        ],
        onSubmit: async (data) => {
            await apiRequest(`/api/products/${product.product_id}`, { method: "PATCH", body: JSON.stringify(data) });
            await Promise.all([loadProducts(), loadInventory(), loadDashboardSummary()]);
            showMessage("Product updated successfully.");
        },
    });
}

async function stockIn() {
    try {
        if (!productCatalog.length) await loadProducts();
    } catch (error) {
        return showMessage(error.message);
    }
    openModal({
        title: "Record Stock Received",
        fields: [
            { name: "productId", label: "Product", type: "select", required: true, options: productCatalog.map((item) => ({ value: item.product_id, label: `${item.product_name} (${item.current_stock} ${item.unit})` })) },
            { name: "quantity", label: "Quantity received", type: "number", min: "0.01", step: "0.01", required: true },
            { name: "supplierId", label: "Supplier (optional)", type: "select", options: [{ value: "", label: "No supplier selected" }, ...supplierCatalog.filter((item) => item.status === "Active").map((item) => ({ value: item.supplier_id, label: item.supplier_name }))] },
            { name: "unitCost", label: "Unit cost (₱)", type: "number", min: "0", step: "0.01", value: "0" },
            { name: "referenceNumber", label: "Reference number" },
            { name: "notes", label: "Notes", maxLength: 500 },
        ],
        onSubmit: async (data) => {
            await apiRequest("/api/stock-in", { method: "POST", body: JSON.stringify(data) });
            await Promise.all([loadInventory(), loadProducts(), loadDashboardSummary(), loadStockReceipts()]);
            showMessage("Stock receipt recorded successfully.");
        },
    });
}

function addCustomer() {
    openModal({
        title: "Add Customer",
        fields: [
            { name: "fullName", label: "Customer name", required: true },
            { name: "contactNumber", label: "Contact number", type: "tel", required: true },
        ],
        onSubmit: async (data) => {
            await apiRequest("/api/customers", { method: "POST", body: JSON.stringify(data) });
            await loadCustomers();
            showMessage("Customer added successfully.");
        },
    });
}

function addSupplier() {
    openModal({
        title: "Add Supplier",
        fields: [
            { name: "supplierName", label: "Supplier name", required: true },
            { name: "contactPerson", label: "Contact person", required: true },
            { name: "contactNumber", label: "Contact number", type: "tel", required: true },
        ],
        onSubmit: async (data) => {
            await apiRequest("/api/suppliers", { method: "POST", body: JSON.stringify(data) });
            await loadSuppliers();
            showMessage("Supplier added successfully.");
        },
    });
}

function addStaffUser() {
    openModal({
        title: "Create Staff Account",
        fields: [
            { name: "username", label: "Username", required: true },
            { name: "password", label: "Temporary password (8+ characters)", type: "password", min: "8", required: true },
            { name: "role", label: "Role", type: "select", required: true, options: [{ value: "Cashier", label: "Cashier" }, { value: "Store Clerk", label: "Store Clerk" }] },
        ],
        onSubmit: async (data) => {
            await apiRequest("/api/register", { method: "POST", body: JSON.stringify(data) });
            await loadUsers();
            showMessage("Staff account created.");
        },
    });
}

function searchTable(input) {
    const filter = input.value.toLocaleLowerCase();
    input.closest(".table-box")?.querySelectorAll("tbody tr").forEach((row) => {
        row.hidden = !row.textContent.toLocaleLowerCase().includes(filter);
    });
}

let supplierCatalog = [];

async function loadProducts() {
    const products = await apiRequest("/api/products");
    productCatalog = products;
    const productGrid = document.querySelector(".products-grid");
    if (productGrid) {
        productGrid.replaceChildren();
        for (const product of products) {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "product-card";
            card.disabled = Number(product.current_stock) <= 0;
            card.dataset.category = product.category;
            card.dataset.search = `${product.product_name} ${product.category} ${product.product_code}`.toLowerCase();
            card.innerHTML = `<div class="product-topline"><span class="product-symbol">${uiIcon("box", "size-[18px]")}</span><span class="product-category">${escapeHtml(product.category)}</span></div><strong>${escapeHtml(product.product_name)}</strong><div class="product-bottom"><div><span class="price">${money(product.selling_price)}</span><small>${Number(product.current_stock) > 0 ? `${Number(product.current_stock).toLocaleString()} ${escapeHtml(product.unit)} in stock` : "Out of stock"}</small></div><span class="product-add">${uiIcon("plus")}</span></div>`;
            card.addEventListener("click", () => addToCart(Number(product.product_id)));
            productGrid.append(card);
        }
        if (!products.length) productGrid.innerHTML = '<p class="empty-state col-span-full">No products yet.</p>';
        const count = document.getElementById("productCount");
        if (count) count.textContent = `${products.length} product${products.length === 1 ? "" : "s"}`;
        const categories = ["All", ...new Set(products.map((product) => product.category))];
        if (!categories.includes(productCategory)) productCategory = "All";
        const filters = document.getElementById("productCategoryFilters");
        if (filters) {
            filters.replaceChildren();
            for (const category of categories) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `category-filter${category === productCategory ? " active" : ""}`;
                button.textContent = category;
                button.setAttribute("aria-pressed", String(category === productCategory));
                button.addEventListener("click", () => { productCategory = category; filterProducts(); });
                filters.append(button);
            }
        }
    }

    const rows = document.querySelector("#products tbody");
    if (rows) {
        rows.replaceChildren();
        for (const product of products) {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${escapeHtml(product.product_code)}</td><td>${escapeHtml(product.product_name)}</td><td>${escapeHtml(product.category)}</td><td>₱${Number(product.selling_price).toLocaleString()} / ${escapeHtml(product.unit)}</td><td>${Number(product.current_stock).toLocaleString()} ${escapeHtml(product.unit)}</td>`;
            if (currentSession?.role === "Owner / Manager") {
                const action = row.insertCell();
                const button = document.createElement("button");
                button.className = "btn btn-warning";
                button.type = "button";
                button.dataset.productId = product.product_id;
                button.textContent = "Edit";
                button.addEventListener("click", () => editProduct(button));
                action.append(button);
                if (Number(product.current_stock) === 0) action.append(actionButton("Archive", () => archiveProduct(product)));
            }
            rows.append(row);
        }
    }
    if (rows) emptyRows(rows, "No products yet. Add a product to get started.");
    filterProducts();
}

async function loadCustomers() {
    const rows = document.querySelector("#customerRows, #customers tbody");
    if (!rows) return;
    const customers = await apiRequest("/api/customers");
    rows.replaceChildren();
    for (const customer of customers) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(customer.customer_code)}</td><td>${escapeHtml(customer.full_name)}</td><td>${escapeHtml(customer.contact_number)}</td><td>₱${Number(customer.total_purchases).toLocaleString()}</td>`;
        row.insertCell().append(actionButton("Edit", () => editCustomer(customer)));
        rows.append(row);
    }
    const customerCount = document.getElementById("dashboardCustomers");
    if (customerCount) customerCount.textContent = customers.length.toLocaleString();
    const select = document.getElementById("saleCustomer");
    if (select) {
        const selected = select.value;
        select.replaceChildren(new Option("Walk-in customer", ""));
        for (const customer of customers) select.add(new Option(customer.full_name, customer.customer_id));
        select.value = selected;
    }
    emptyRows(rows, "No customers yet. Walk-in sales are available.");
}

async function loadSales() {
    const rows = document.querySelector("#salesRows, #reportSalesRows");
    if (!rows) return;
    const parameters = new URLSearchParams({ offset: salesOffset });
    const dateFrom = document.getElementById("reportFrom")?.value;
    const dateTo = document.getElementById("reportTo")?.value;
    if (dateFrom) parameters.set("from", dateFrom);
    if (dateTo) parameters.set("to", dateTo);
    const sales = await apiRequest(`/api/sales${parameters.size ? `?${parameters}` : ""}`);
    rows.replaceChildren();
    for (const sale of sales) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(sale.transaction_code)}</td><td>${escapeHtml(sale.customer_name)}</td><td>${localTime(sale.sold_at)}</td><td>${money(sale.total_amount)}</td><td>${escapeHtml(sale.payment_method)}</td><td><span class="badge ${sale.status === "Completed" ? "available" : "out"}">${escapeHtml(sale.status)}</span></td>`;
        const actions = row.insertCell();
        actions.append(actionButton("Receipt", () => viewSale(sale.sale_id)));
        if (currentSession.role === "Owner / Manager" && sale.status === "Completed") actions.append(actionButton("Void", () => openVoidSale(sale)));
        rows.append(row);
    }
    emptyRows(rows, "No transactions in this date range.");
    updatePager("sales", salesOffset, sales.length);
}

async function loadInventory() {
    const rows = document.getElementById("inventoryRows");
    if (!rows) return;
    const inventory = await apiRequest("/api/inventory");
    rows.replaceChildren();
    let available = 0;
    let low = 0;
    let out = 0;
    for (const product of inventory) {
        if (product.stock_status === "Available") available++;
        else if (product.stock_status === "Low Stock") low++;
        else out++;
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(product.product_name)}</td><td>${escapeHtml(product.category)}</td><td>${Number(product.current_stock).toLocaleString()} ${escapeHtml(product.unit)}</td><td>${Number(product.minimum_stock).toLocaleString()} ${escapeHtml(product.unit)}</td><td><span class="badge ${product.stock_status === "Available" ? "available" : product.stock_status === "Low Stock" ? "low" : "out"}">${escapeHtml(product.stock_status)}</span></td>`;
        rows.append(row);
    }
    for (const [id, value] of [
        ["totalProducts", inventory.length],
        ["availableProducts", available],
        ["lowStockProducts", low],
        ["outStockProducts", out],
        ["inventoryTotalProducts", inventory.length],
        ["inventoryAvailableProducts", available],
        ["inventoryLowStockProducts", low],
        ["inventoryOutStockProducts", out],
    ]) {
        const element = document.getElementById(id);
        if (element) element.textContent = value.toLocaleString();
    }
    emptyRows(rows, "No products yet. Add products before receiving stock.");
}

async function loadSuppliers() {
    const rows = document.querySelector("#suppliers tbody");
    if (!rows) return;
    supplierCatalog = await apiRequest("/api/suppliers");
    rows.replaceChildren();
    for (const supplier of supplierCatalog) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(supplier.supplier_code)}</td><td>${escapeHtml(supplier.supplier_name)}</td><td>${escapeHtml(supplier.contact_person)}</td><td>${escapeHtml(supplier.contact_number)}</td><td><span class="badge ${supplier.status === "Active" ? "available" : "out"}">${escapeHtml(supplier.status)}</span></td>`;
        if (currentSession.role === "Owner / Manager") row.insertCell().append(actionButton("Edit", () => editSupplier(supplier)));
        rows.append(row);
    }
    emptyRows(rows, "No suppliers yet.");
}

async function loadUsers() {
    const rows = document.getElementById("userRows");
    if (!rows) return;
    const users = await apiRequest("/api/users");
    rows.replaceChildren();
    for (const user of users) {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.role)}</td><td><span class="badge ${user.is_active ? "available" : "out"}">${user.is_active ? "Active" : "Inactive"}</span></td><td>${new Date(user.created_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}</td>`;
        if (user.user_id !== currentSession.userId) row.insertCell().append(actionButton("Manage", () => manageUser(user)));
        else row.insertCell().textContent = "You";
        rows.append(row);
    }
    emptyRows(rows, "No accounts found.");
}

async function loadDashboardSummary() {
    if (currentSession?.role !== "Owner / Manager") return;
    const summary = await apiRequest("/api/reports/summary");
    const values = {
        salesToday: `₱${Number(summary.sales_total).toLocaleString()}`,
        dashboardProducts: Number(summary.total_products || 0).toLocaleString(),
        dashboardLowStock: Number(summary.low_stock_products || 0).toLocaleString(),
        dashboardCustomers: document.getElementById("dashboardCustomers")?.textContent || "—",
    };
    for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
    const alert = document.getElementById("lowStockAlert");
    if (alert) {
        alert.hidden = !Number(summary.low_stock_products);
        alert.querySelector("[data-low-stock-count]").textContent = summary.low_stock_products;
    }
    const rows = document.getElementById("recentSalesRows");
    if (rows) {
        rows.replaceChildren();
        for (const sale of summary.recent_sales) {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${escapeHtml(sale.transaction_code)}</td><td>${escapeHtml(sale.customer_name)}</td><td>${localTime(sale.sold_at)}</td><td>${money(sale.total_amount)}</td><td><span class="badge ${sale.status === "Completed" ? "available" : "out"}">${escapeHtml(sale.status)}</span></td>`;
            rows.append(row);
        }
        emptyRows(rows, "No sales recorded yet.");
    }
    for (const [id, value] of [["reportSalesTotal", `₱${Number(summary.sales_total).toLocaleString()}`], ["reportTransactionCount", Number(summary.transaction_count).toLocaleString()], ["reportInventoryCount", Number(summary.total_products).toLocaleString()]]) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }
}

async function refreshDashboard() {
    const loaders = [loadProducts, loadInventory, loadStockReceipts];
    if (currentSession.role === "Owner / Manager") loaders.push(loadCustomers, loadSuppliers, loadUsers, loadDashboardSummary, loadSales);
    if (currentSession.role === "Cashier") loaders.push(loadCustomers, loadSales);
    if (currentSession.role === "Store Clerk") loaders.push(loadSuppliers);
    const results = await Promise.allSettled(loaders.map((load) => load()));
    const failure = results.find((result) => result.status === "rejected");
    if (failure) {
        console.error("Dashboard data could not be fully loaded:", failure.reason);
        showMessage(`Some data could not be loaded: ${failure.reason.message}`);
    }
}

function actionButton(label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-warning";
    button.textContent = label;
    button.addEventListener("click", () => Promise.resolve(callback()).catch((error) => showMessage(error.message)));
    return button;
}

function emptyRows(rows, message) {
    if (!rows.children.length) {
        const row = rows.insertRow();
        const cell = row.insertCell();
        cell.colSpan = rows.closest("table").querySelectorAll("thead th").length;
        cell.className = "empty-state";
        cell.textContent = message;
    }
    const headings = [...rows.closest("table").querySelectorAll("thead th")];
    for (const row of rows.rows) {
        if (row.cells.length !== headings.length) continue;
        [...row.cells].forEach((cell, index) => {
            if (["Amount", "Price", "Stock", "Minimum", "Total spent", "Quantity", "Unit cost"].includes(headings[index].textContent.trim())) cell.classList.add("numeric");
            if (headings[index].textContent.trim() === "Actions") cell.classList.add("actions");
        });
        if (row.cells[0]) row.cells[0].title = row.cells[0].textContent;
    }
    const search = rows.closest(".table-box")?.querySelector(".search");
    if (search) searchTable(search);
}

function changeQuantity(index, input) {
    if (checkingOut) return;
    const quantity = Number(input.value);
    const product = productCatalog.find((product) => product.product_id === cart[index]?.productId);
    if (!product || !/^\d+(\.\d{1,2})?$/.test(input.value) || quantity <= 0 || quantity > 1_000_000 || quantity > Number(product.current_stock)) {
        showMessage("Enter a positive quantity within the available stock, with up to two decimal places.");
        return updateCart();
    }
    cart[index].quantity = quantity;
    saleRequestId = null;
    updateCart();
}

function filterProducts() {
    const query = document.getElementById("productSearch")?.value.toLowerCase() || "";
    const cards = [...document.querySelectorAll(".products-grid .product-card")];
    cards.forEach((card) => { card.hidden = !(card.dataset.search.includes(query) && (productCategory === "All" || card.dataset.category === productCategory)); });
    document.querySelectorAll(".category-filter").forEach((button) => {
        button.classList.toggle("active", button.textContent === productCategory);
        button.setAttribute("aria-pressed", String(button.textContent === productCategory));
    });
    const empty = document.getElementById("productSearchEmpty");
    if (empty) empty.hidden = cards.length === 0 || cards.some((card) => !card.hidden);
}

function editCustomer(customer) {
    openModal({ title: "Edit Customer", fields: [
        { name: "fullName", label: "Name", value: customer.full_name, maxLength: 120, required: true },
        { name: "contactNumber", label: "Contact number", value: customer.contact_number, type: "tel", maxLength: 40, required: true },
    ], onSubmit: async (data) => { await apiRequest(`/api/customers/${customer.customer_id}`, { method: "PATCH", body: JSON.stringify(data) }); await loadCustomers(); showMessage("Customer updated."); } });
}

function editSupplier(supplier) {
    openModal({ title: "Edit Supplier", fields: [
        { name: "supplierName", label: "Supplier name", value: supplier.supplier_name, maxLength: 120, required: true },
        { name: "contactPerson", label: "Contact person", value: supplier.contact_person, maxLength: 120, required: true },
        { name: "contactNumber", label: "Contact number", value: supplier.contact_number, type: "tel", maxLength: 40, required: true },
        { name: "status", label: "Status", type: "select", value: supplier.status, options: ["Active", "Inactive"].map((value) => ({ value, label: value })) },
    ], onSubmit: async (data) => { await apiRequest(`/api/suppliers/${supplier.supplier_id}`, { method: "PATCH", body: JSON.stringify(data) }); await loadSuppliers(); showMessage("Supplier updated."); } });
}

function manageUser(user) {
    openModal({ title: `Manage ${user.username}`, fields: [
        { name: "role", label: "Role", type: "select", value: user.role, options: ["Owner / Manager", "Cashier", "Store Clerk"].map((value) => ({ value, label: value })) },
        { name: "isActive", label: "Access", type: "select", value: String(Boolean(user.is_active)), options: [{ value: "true", label: "Active" }, { value: "false", label: "Disabled" }] },
        { name: "password", label: "Reset password (optional, 8+ characters)", type: "password", maxLength: 256 },
    ], onSubmit: async (data) => {
        if (!data.password) delete data.password;
        data.isActive = data.isActive === "true";
        await apiRequest(`/api/users/${user.user_id}`, { method: "PATCH", body: JSON.stringify(data) });
        await loadUsers(); showMessage("Account updated. Existing sessions have been revoked.");
    } });
}

function changeMyPassword() {
    openModal({ title: "Change Password", fields: [
        { name: "currentPassword", label: "Current password", type: "password", required: true },
        { name: "newPassword", label: "New password (8+ characters)", type: "password", maxLength: 256, required: true },
        { name: "confirmPassword", label: "Confirm new password", type: "password", required: true },
    ], onSubmit: async (data) => {
        if (data.newPassword !== data.confirmPassword) throw new Error("New passwords do not match.");
        await apiRequest("/api/account/password", { method: "POST", body: JSON.stringify(data) });
        currentSession = null; window.location.replace("admindashboard.html");
    } });
}

function archiveProduct(product) {
    openModal({ title: `Archive ${product.product_name}?`, fields: [{ name: "confirmation", label: "Type ARCHIVE to remove this zero-stock product from the catalog. Past receipts are retained.", required: true }], onSubmit: async (data) => {
        if (data.confirmation !== "ARCHIVE") throw new Error("Type ARCHIVE to confirm.");
        await apiRequest(`/api/products/${product.product_id}`, { method: "DELETE", body: "{}" });
        await refreshDashboard(); showMessage("Product archived.");
    } });
}

async function viewSale(id) {
    const sale = await apiRequest(`/api/sales/${id}`);
    showReceipt(sale, sale.items, sale.customerName, sale.paymentMethod);
}

function openVoidSale(sale) {
    openModal({ title: `Void ${sale.transaction_code}`, fields: [{ name: "reason", label: "Reason (stock will be restored)", maxLength: 500, required: true }], onSubmit: async (data) => {
        await apiRequest(`/api/sales/${sale.sale_id}/void`, { method: "POST", body: JSON.stringify(data) });
        await refreshDashboard(); showMessage("Sale voided and stock restored.");
    } });
}

function updatePager(kind, offset, count) {
    const pager = document.getElementById(`${kind}Pager`);
    if (!pager) return;
    pager.querySelector("span").textContent = `Page ${offset / 100 + 1} · ${count} records`;
    pager.querySelector('[data-direction="previous"]').disabled = offset === 0;
    pager.querySelector('[data-direction="next"]').disabled = count < 100;
}

async function pageSales(direction) {
    salesOffset = Math.max(0, salesOffset + direction * 100);
    try { await loadSales(); } catch (error) { salesOffset = Math.max(0, salesOffset - direction * 100); showMessage(error.message); }
}

async function applySalesDates() {
    salesOffset = 0;
    try { await loadSales(); } catch (error) { showMessage(error.message); }
}

async function loadStockReceipts() {
    const rows = document.getElementById("stockReceiptRows");
    if (!rows || currentSession?.role === "Cashier") return;
    const receipts = await apiRequest(`/api/stock-receipts?offset=${receiptOffset}`);
    rows.replaceChildren();
    for (const receipt of receipts) {
        const row = rows.insertRow();
        for (const value of [localTime(receipt.received_at), receipt.product_name, `${receipt.quantity} ${receipt.unit}`, money(receipt.unit_cost), receipt.supplier_name, receipt.reference_number || "—", receipt.received_by, receipt.notes || "—"]) row.insertCell().textContent = value;
    }
    emptyRows(rows, "No stock receipts recorded yet.");
    updatePager("receipts", receiptOffset, receipts.length);
}

async function pageReceipts(direction) {
    receiptOffset = Math.max(0, receiptOffset + direction * 100);
    try { await loadStockReceipts(); } catch (error) { receiptOffset = Math.max(0, receiptOffset - direction * 100); showMessage(error.message); }
}

async function allReportSales(kind = "transactions") {
    const parameters = new URLSearchParams();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const from = kind === "daily" ? today : document.getElementById("reportFrom")?.value;
    const to = kind === "daily" ? today : document.getElementById("reportTo")?.value;
    if (from) parameters.set("from", from);
    if (to) parameters.set("to", to);
    const sales = [];
    for (let offset = 0; ; offset += 100) {
        parameters.set("offset", offset);
        const page = await apiRequest(`/api/sales?${parameters}`);
        sales.push(...page);
        if (page.length < 100) break;
    }
    return sales;
}

async function reportData(kind) {
    if (kind === "inventory") return { headers: ["Product", "Category", "Unit", "Current stock", "Minimum stock"], rows: (await apiRequest("/api/inventory")).map((item) => [item.product_name, item.category, item.unit, item.current_stock, item.minimum_stock]) };
    const sales = await allReportSales(kind);
    return { headers: ["Transaction", "Customer", "Date (Manila)", "Amount (PHP)", "Payment", "Status"], rows: sales.map((sale) => [sale.transaction_code, sale.customer_name, localTime(sale.sold_at), Number(sale.total_amount).toFixed(2), sale.payment_method, sale.status]), total: sales.filter((sale) => sale.status === "Completed").reduce((sum, sale) => sum + Math.round(Number(sale.total_amount) * 100), 0) / 100 };
}

async function exportReport(kind = "transactions") {
    try {
        const { headers, rows } = await reportData(kind);
        const cell = (value) => { const text = String(value); const safe = /^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; };
        const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `gfamily-${kind}-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showMessage(error.message); }
}

async function printReport(kind = "transactions") {
    try {
        const { headers, rows, total } = await reportData(kind);
        const area = document.getElementById("printArea") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "printArea" }));
        const range = kind === "transactions" ? `${document.getElementById("reportFrom")?.value || "Start"} to ${document.getElementById("reportTo")?.value || "Present"}` : "";
        area.innerHTML = `<h1>GFamily Frozen Products</h1><h2>${escapeHtml(kind)} report</h2><p>${escapeHtml(range)} · Generated ${localTime(new Date())}</p>${total === undefined ? "" : `<p>Completed sales: ${money(total)}</p>`}<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
        document.body.classList.add("printing-report");
        window.addEventListener("afterprint", () => document.body.classList.remove("printing-report"), { once: true });
        window.print();
    } catch (error) { showMessage(error.message); }
}

document.addEventListener("DOMContentLoaded", async () => {
    const dateLabel = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date());
    document.querySelectorAll("[data-store-date]").forEach((element) => { element.textContent = dateLabel; });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { closeModal(); closeReceipt(); toggleSidebar(false); }
        if (event.key === "Tab") {
            const modal = document.querySelector(".modal-overlay.show") || (document.body.classList.contains("nav-open") ? document.getElementById("appSidebar") : null);
            if (!modal) return;
            const focusable = [...modal.querySelectorAll("button, input, select")].filter((element) => !element.disabled && element.offsetParent !== null);
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    window.addEventListener("resize", () => { if (window.innerWidth >= 1024 && document.body.classList.contains("nav-open")) toggleSidebar(false); });
    document.querySelectorAll("#saleCustomer, #paymentMethod").forEach((element) => element.addEventListener("change", () => { saleRequestId = null; }));
    document.getElementById("authForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = document.getElementById("authButton");
        if (button.disabled) return;
        button.disabled = true;
        try { if (authMode === "register") await register(); else await login(); }
        finally { button.disabled = false; }
    });
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const updateVisibility = () => {
            button.hidden = !input.value;
            if (!input.value && input.type === "text") {
                input.type = "password";
                button.textContent = "Show";
                button.setAttribute("aria-label", `Show ${input.labels[0]?.textContent.toLowerCase() || "password"}`);
                button.setAttribute("aria-pressed", "false");
            }
        };
        input.addEventListener("input", updateVisibility);
        button.addEventListener("click", () => {
            const visible = input.type === "password";
            input.type = visible ? "text" : "password";
            button.textContent = visible ? "Hide" : "Show";
            button.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${input.labels[0]?.textContent.toLowerCase() || "password"}`);
            button.setAttribute("aria-pressed", String(visible));
            input.focus();
        });
        updateVisibility();
    });
    const roleForPage = document.body.dataset.role;
    if (window.location.protocol === "file:") {
        if (roleForPage) {
            document.getElementById("system").style.display = "none";
        }
        const login = document.getElementById("loginPage");
        if (login) login.style.display = "flex";
        const system = document.getElementById("system");
        if (system) system.style.display = "none";
        const toggle = document.getElementById("authToggle");
        if (toggle) toggle.hidden = true;
        showMessage(LOCAL_SERVER_MESSAGE);
        return;
    }
    try {
        const result = await apiRequest("/api/session");
        currentSession = result.user;
    } catch (error) {
        console.error("Could not verify session:", error);
        currentSession = null;
    }

    if (!currentSession) {
        if (roleForPage) {
            window.location.replace("admindashboard.html");
            return;
        }
        document.getElementById("loginPage").style.display = "flex";
        document.getElementById("system").style.display = "none";
        const toggle = document.getElementById("authToggle");
        if (toggle) {
            try {
                const setup = await apiRequest("/api/setup-status");
                window.setupTokenRequired = setup.setupTokenRequired;
                toggle.hidden = !setup.ownerSetupAvailable;
                if (!setup.ownerSetupAvailable) {
                    showMessage("");
                }
            } catch (error) {
                toggle.hidden = true;
                console.error("Could not check first-account setup status:", error);
                showMessage("Account setup status could not be checked. Check the database connection and refresh the page.");
            }
        }
        if (new URLSearchParams(window.location.search).get("logout") === "incomplete") {
            showMessage("You were signed out on this device, but the server could not revoke the session. Contact an administrator.");
        }
        return;
    }

    if (roleForPage && currentSession.role !== roleForPage) {
        window.location.replace(dashboardPath(currentSession.role));
        return;
    }
    if (!roleForPage && currentSession.role !== "Owner / Manager") {
        window.location.replace(dashboardPath(currentSession.role));
        return;
    }

    const system = document.getElementById("system");
    if (system) system.style.display = "block";
    document.getElementById("loginPage")?.style.setProperty("display", "none");
    const username = document.getElementById("currentUser");
    if (username) username.textContent = currentSession.username;
    const role = document.getElementById("currentRole");
    if (role) role.textContent = currentSession.role;
    const roleLabel = document.querySelector(".user-info small");
    if (roleLabel) roleLabel.textContent = currentSession.role;
    const avatar = document.querySelector(".avatar");
    if (avatar) avatar.textContent = currentSession.username.slice(0, 1).toUpperCase();
    await refreshDashboard();
    if (document.getElementById("cartItems")) updateCart();
});
