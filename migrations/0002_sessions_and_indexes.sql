CREATE TABLE sessions (
    session_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sales_sold_at ON sales(sold_at);
CREATE INDEX idx_sales_cashier_sold_at ON sales(cashier_id, sold_at);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_local_day ON sales(date(sold_at, '+8 hours'));
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX idx_stock_receipts_received_at ON stock_receipts(received_at);
CREATE INDEX idx_stock_receipt_items_product_id ON stock_receipt_items(product_id);
CREATE INDEX idx_products_active_name ON products(is_active, product_name);
CREATE INDEX idx_customers_full_name ON customers(full_name);
CREATE INDEX idx_suppliers_name ON suppliers(supplier_name);
