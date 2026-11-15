CREATE TABLE users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Owner / Manager', 'Cashier', 'Store Clerk')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE suppliers (
    supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_code TEXT NOT NULL UNIQUE,
    supplier_name TEXT NOT NULL,
    contact_person TEXT NOT NULL,
    contact_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    product_id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT NOT NULL UNIQUE,
    product_name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'unit',
    selling_price REAL NOT NULL CHECK (selling_price >= 0),
    current_stock REAL NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    minimum_stock REAL NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_receipts (
    stock_receipt_id TEXT PRIMARY KEY,
    supplier_id INTEGER NULL,
    received_by INTEGER NOT NULL,
    reference_number TEXT NULL,
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL,
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    FOREIGN KEY (received_by) REFERENCES users(user_id) ON DELETE RESTRICT
);

CREATE TABLE stock_receipt_items (
    stock_receipt_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_receipt_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_cost REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    FOREIGN KEY (stock_receipt_id) REFERENCES stock_receipts(stock_receipt_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

CREATE TABLE sales (
    sale_id TEXT PRIMARY KEY,
    transaction_code TEXT NOT NULL UNIQUE,
    customer_id INTEGER NULL,
    cashier_id INTEGER NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'GCash', 'Card')),
    status TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Voided')),
    sold_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE SET NULL,
    FOREIGN KEY (cashier_id) REFERENCES users(user_id) ON DELETE RESTRICT
);

CREATE TABLE sale_items (
    sale_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit_price REAL NOT NULL CHECK (unit_price >= 0),
    line_total REAL GENERATED ALWAYS AS (quantity * unit_price) STORED,
    FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

CREATE VIEW inventory_status AS
SELECT
    product_id,
    product_code,
    product_name,
    category,
    unit,
    current_stock,
    minimum_stock,
    CASE
        WHEN current_stock = 0 THEN 'Out of Stock'
        WHEN current_stock <= minimum_stock THEN 'Low Stock'
        ELSE 'Available'
    END AS stock_status
FROM products
WHERE is_active = 1;

CREATE VIEW customer_purchase_totals AS
SELECT
    c.customer_id,
    c.customer_code,
    c.full_name,
    c.contact_number,
    COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.total_amount ELSE 0 END), 0) AS total_purchases
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_code, c.full_name, c.contact_number;

INSERT INTO products
    (product_code, product_name, category, unit, selling_price, current_stock, minimum_stock)
VALUES
    ('P001', 'Chicken Wings', 'Chicken', 'kg', 180.00, 45, 10),
    ('P002', 'Frozen Burger', 'Processed Food', 'pack', 120.00, 30, 10),
    ('P003', 'Hotdog', 'Processed Food', 'pack', 150.00, 8, 10),
    ('P004', 'French Fries', 'Processed Food', 'pack', 100.00, 20, 10),
    ('P005', 'Siomai', 'Processed Food', 'pack', 90.00, 25, 10),
    ('P006', 'Fish Fillet', 'Seafood', 'pack', 200.00, 15, 10),
    ('P007', 'Fish Balls', 'Seafood', 'pack', 80.00, 0, 10);

INSERT INTO customers (customer_code, full_name, contact_number)
VALUES
    ('C001', 'Juan Dela Cruz', '09123456789'),
    ('C002', 'Maria Santos', '09987654321');

INSERT INTO suppliers (supplier_code, supplier_name, contact_person, contact_number)
VALUES
    ('S001', 'ABC Frozen Foods', 'John Cruz', '09123456789'),
    ('S002', 'XYZ Food Distributor', 'Mark Santos', '09987654321');
