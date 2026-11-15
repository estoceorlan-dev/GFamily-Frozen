CREATE TABLE product_categories (
    category_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE product_units (
    unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

INSERT OR IGNORE INTO product_categories (name)
SELECT DISTINCT trim(category) FROM products WHERE trim(category) <> '';

INSERT OR IGNORE INTO product_units (name)
SELECT DISTINCT trim(unit) FROM products WHERE trim(unit) <> '';

INSERT INTO product_categories (name)
SELECT 'General' WHERE NOT EXISTS (SELECT 1 FROM product_categories);

INSERT INTO product_units (name)
SELECT 'unit' WHERE NOT EXISTS (SELECT 1 FROM product_units);
