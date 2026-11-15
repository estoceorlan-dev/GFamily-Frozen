CREATE DATABASE IF NOT EXISTS gfamily_frozen_system
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE gfamily_frozen_system;

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Owner / Manager', 'Cashier', 'Store Clerk') NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username),
    CONSTRAINT chk_users_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
    customer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_code VARCHAR(32) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    contact_number VARCHAR(40) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (customer_id),
    UNIQUE KEY uq_customers_code (customer_code),
    KEY idx_customers_full_name (full_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    supplier_code VARCHAR(32) NOT NULL,
    supplier_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(150) NOT NULL,
    contact_number VARCHAR(40) NOT NULL,
    status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (supplier_id),
    UNIQUE KEY uq_suppliers_code (supplier_code),
    KEY idx_suppliers_name (supplier_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
    product_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    product_code VARCHAR(32) NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(40) NOT NULL DEFAULT 'unit',
    selling_price DECIMAL(12, 2) NOT NULL,
    current_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
    minimum_stock DECIMAL(12, 3) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (product_id),
    UNIQUE KEY uq_products_code (product_code),
    KEY idx_products_active_name (is_active, product_name),
    CONSTRAINT chk_products_selling_price CHECK (selling_price >= 0),
    CONSTRAINT chk_products_current_stock CHECK (current_stock >= 0),
    CONSTRAINT chk_products_minimum_stock CHECK (minimum_stock >= 0),
    CONSTRAINT chk_products_is_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
    session_id CHAR(36) NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id),
    UNIQUE KEY uq_sessions_token_hash (token_hash),
    KEY idx_sessions_expires_at (expires_at),
    CONSTRAINT fk_sessions_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_receipts (
    stock_receipt_id CHAR(36) NOT NULL,
    supplier_id BIGINT UNSIGNED NULL,
    received_by BIGINT UNSIGNED NOT NULL,
    reference_number VARCHAR(100) NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL,
    PRIMARY KEY (stock_receipt_id),
    KEY idx_stock_receipts_supplier (supplier_id),
    KEY idx_stock_receipts_received_by (received_by),
    KEY idx_stock_receipts_received_at (received_at),
    CONSTRAINT fk_stock_receipts_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers (supplier_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_stock_receipts_user
        FOREIGN KEY (received_by) REFERENCES users (user_id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_receipt_items (
    stock_receipt_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    stock_receipt_id CHAR(36) NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    unit_cost DECIMAL(12, 2) NOT NULL DEFAULT 0,
    PRIMARY KEY (stock_receipt_item_id),
    KEY idx_stock_receipt_items_receipt (stock_receipt_id),
    KEY idx_stock_receipt_items_product (product_id),
    CONSTRAINT chk_stock_receipt_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_stock_receipt_items_unit_cost CHECK (unit_cost >= 0),
    CONSTRAINT fk_stock_receipt_items_receipt
        FOREIGN KEY (stock_receipt_id) REFERENCES stock_receipts (stock_receipt_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_stock_receipt_items_product
        FOREIGN KEY (product_id) REFERENCES products (product_id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sales (
    sale_id CHAR(36) NOT NULL,
    transaction_code VARCHAR(64) NOT NULL,
    customer_id BIGINT UNSIGNED NULL,
    cashier_id BIGINT UNSIGNED NOT NULL,
    subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_method ENUM('Cash', 'GCash', 'Card') NOT NULL DEFAULT 'Cash',
    status ENUM('Completed', 'Voided') NOT NULL DEFAULT 'Completed',
    sold_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (sale_id),
    UNIQUE KEY uq_sales_transaction_code (transaction_code),
    KEY idx_sales_sold_at (sold_at),
    KEY idx_sales_cashier_sold_at (cashier_id, sold_at),
    KEY idx_sales_customer_id (customer_id),
    CONSTRAINT chk_sales_subtotal CHECK (subtotal >= 0),
    CONSTRAINT chk_sales_total_amount CHECK (total_amount >= 0),
    CONSTRAINT fk_sales_customer
        FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_sales_cashier
        FOREIGN KEY (cashier_id) REFERENCES users (user_id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
    sale_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sale_id CHAR(36) NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(12, 3) NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    line_total DECIMAL(15, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    PRIMARY KEY (sale_item_id),
    KEY idx_sale_items_sale_id (sale_id),
    KEY idx_sale_items_product_id (product_id),
    CONSTRAINT chk_sale_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_sale_items_unit_price CHECK (unit_price >= 0),
    CONSTRAINT fk_sale_items_sale
        FOREIGN KEY (sale_id) REFERENCES sales (sale_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_sale_items_product
        FOREIGN KEY (product_id) REFERENCES products (product_id)
        ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE OR REPLACE VIEW inventory_status AS
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

CREATE OR REPLACE VIEW customer_purchase_totals AS
SELECT
    c.customer_id,
    c.customer_code,
    c.full_name,
    c.contact_number,
    COALESCE(SUM(CASE WHEN s.status = 'Completed' THEN s.total_amount ELSE 0 END), 0) AS total_purchases
FROM customers c
LEFT JOIN sales s ON s.customer_id = c.customer_id
GROUP BY c.customer_id, c.customer_code, c.full_name, c.contact_number;

INSERT IGNORE INTO products
    (product_code, product_name, category, unit, selling_price, current_stock, minimum_stock)
VALUES
    ('P001', 'Chicken Wings', 'Chicken', 'kg', 180.00, 45, 10),
    ('P002', 'Frozen Burger', 'Processed Food', 'pack', 120.00, 30, 10),
    ('P003', 'Hotdog', 'Processed Food', 'pack', 150.00, 8, 10),
    ('P004', 'French Fries', 'Processed Food', 'pack', 100.00, 20, 10),
    ('P005', 'Siomai', 'Processed Food', 'pack', 90.00, 25, 10),
    ('P006', 'Fish Fillet', 'Seafood', 'pack', 200.00, 15, 10),
    ('P007', 'Fish Balls', 'Seafood', 'pack', 80.00, 0, 10);

INSERT IGNORE INTO customers (customer_code, full_name, contact_number)
VALUES
    ('C001', 'Juan Dela Cruz', '09123456789'),
    ('C002', 'Maria Santos', '09987654321');

INSERT IGNORE INTO suppliers (supplier_code, supplier_name, contact_person, contact_number)
VALUES
    ('S001', 'ABC Frozen Foods', 'John Cruz', '09123456789'),
    ('S002', 'XYZ Food Distributor', 'Mark Santos', '09987654321');
