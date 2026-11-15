CREATE TABLE users (
    user_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username varchar(50) NOT NULL UNIQUE,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('Owner / Manager', 'Cashier', 'Store Clerk')),
    is_active integer NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_username_ci ON users (lower(username));
CREATE TABLE customers (
    customer_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_code text NOT NULL UNIQUE,
    full_name varchar(120) NOT NULL,
    contact_number varchar(40) NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE suppliers (
    supplier_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier_code text NOT NULL UNIQUE,
    supplier_name varchar(120) NOT NULL,
    contact_person varchar(120) NOT NULL,
    contact_number varchar(40) NOT NULL,
    status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE products (
    product_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_code text NOT NULL UNIQUE,
    product_name varchar(120) NOT NULL,
    category varchar(80) NOT NULL,
    unit varchar(24) NOT NULL,
    selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0),
    current_stock numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    minimum_stock numeric(14,2) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    is_active integer NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sales (
    sale_id text PRIMARY KEY,
    transaction_code text NOT NULL UNIQUE,
    customer_id integer REFERENCES customers ON DELETE SET NULL,
    cashier_id integer NOT NULL REFERENCES users ON DELETE RESTRICT,
    subtotal numeric(16,2) NOT NULL CHECK (subtotal >= 0),
    total_amount numeric(16,2) NOT NULL CHECK (total_amount >= 0),
    payment_method text NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash','GCash','Card')),
    status text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed','Voided')),
    sold_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    void_reason varchar(500),
    voided_by integer REFERENCES users,
    voided_at timestamp
);
CREATE TABLE sale_items (
    sale_item_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sale_id text NOT NULL REFERENCES sales ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES products ON DELETE RESTRICT,
    product_name varchar(120) NOT NULL,
    unit varchar(24) NOT NULL,
    quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
    unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total numeric(16,2) GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED
);
CREATE TABLE stock_receipts (
    stock_receipt_id text PRIMARY KEY,
    supplier_id integer REFERENCES suppliers ON DELETE SET NULL,
    received_by integer NOT NULL REFERENCES users,
    reference_number varchar(100),
    notes varchar(500),
    received_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE stock_receipt_items (
    stock_receipt_item_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_receipt_id text NOT NULL REFERENCES stock_receipts ON DELETE CASCADE,
    product_id integer NOT NULL REFERENCES products,
    quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
    unit_cost numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);
CREATE TABLE sessions (
    session_id text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamp NOT NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sale_requests (
    request_id text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users,
    sale_id text NOT NULL REFERENCES sales,
    payload_hash text NOT NULL
);
CREATE VIEW inventory_status AS SELECT product_id, product_code, product_name, category, unit, current_stock, minimum_stock,
    CASE WHEN current_stock = 0 THEN 'Out of Stock' WHEN current_stock <= minimum_stock THEN 'Low Stock' ELSE 'Available' END AS stock_status
    FROM products WHERE is_active = 1;
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX idx_sales_date ON sales(sold_at DESC, sale_id);
CREATE INDEX idx_sales_cashier_date ON sales(cashier_id, sold_at DESC);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_stock_received ON stock_receipts(received_at DESC);
CREATE INDEX idx_stock_items_receipt ON stock_receipt_items(stock_receipt_id);
CREATE INDEX idx_products_active ON products(is_active, product_name);

-- No sample people or stock are inserted into a new live store.
