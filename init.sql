CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    price DECIMAL(8,2) DEFAULT 0.00
);

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    item_id INT NOT NULL,
    status VARCHAR(20) DEFAULT 'Aberto',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id)
);

INSERT INTO users (username, password) VALUES ('admin', '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa');
INSERT INTO items (name, category, price) VALUES
    ('Marmita Fit', 'Fitness', 18.90),
    ('Marmita Executiva', 'Premium', 24.90),
    ('Marmita Tradicional', 'Clássica', 15.90),
    ('Marmita Vegana', 'Vegana', 21.90),
    ('Marmita Low Carb', 'Fitness', 22.50);
