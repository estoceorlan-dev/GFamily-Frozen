CREATE TABLE product_categories (
    category_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(80) NOT NULL
);
CREATE UNIQUE INDEX product_categories_name_ci ON product_categories ((lower(name)));

CREATE TABLE product_units (
    unit_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(24) NOT NULL
);
CREATE UNIQUE INDEX product_units_name_ci ON product_units ((lower(name)));

INSERT INTO product_categories (name)
SELECT min(trim(category))
FROM products
WHERE trim(category) <> ''
GROUP BY lower(trim(category));

INSERT INTO product_units (name)
SELECT min(trim(unit))
FROM products
WHERE trim(unit) <> ''
GROUP BY lower(trim(unit));

INSERT INTO product_categories (name)
SELECT 'General'
WHERE NOT EXISTS (SELECT 1 FROM product_categories);

INSERT INTO product_units (name)
SELECT 'unit'
WHERE NOT EXISTS (SELECT 1 FROM product_units);
