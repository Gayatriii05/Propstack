-- ============================================================
-- SEED DATA — run after schema.sql + triggers.sql + views.sql
-- Passwords below are bcrypt hashes of "password123" (cost 10)
-- Generate real ones via: node src/utils/hashPassword.js
-- ============================================================

INSERT INTO users (name, email, password_hash, role) VALUES
('Aditi Owner',   'owner@propstack.com',   '$2b$10$UaEbOClNNg3Xb8vWN5/PWuQw8PdUr9RGzynfucBfzI4eXhc4e4qn6', 'owner'),
('Rahul Tenant',  'tenant1@propstack.com', '$2b$10$UaEbOClNNg3Xb8vWN5/PWuQw8PdUr9RGzynfucBfzI4eXhc4e4qn6', 'tenant'),
('Neha Tenant',   'tenant2@propstack.com', '$2b$10$UaEbOClNNg3Xb8vWN5/PWuQw8PdUr9RGzynfucBfzI4eXhc4e4qn6', 'tenant');

INSERT INTO properties (owner_id, name, address, city) VALUES
(1, 'Sunrise Apartments', '12 MG Road', 'Nagpur'),
(1, 'Lakeview Residency', '45 Ring Road', 'Nagpur');

INSERT INTO units (property_id, unit_number, rent_amount, status, bedrooms) VALUES
(1, 'A101', 15000.00, 'vacant', 2),
(1, 'A102', 18000.00, 'vacant', 3),
(2, 'B201', 12000.00, 'vacant', 1),
(2, 'B202', 20000.00, 'vacant', 3);

INSERT INTO leases (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit, status) VALUES
(1, 2, '2026-01-01', '2026-12-31', 15000.00, 30000.00, 'active'),
(3, 3, '2026-02-01', '2027-01-31', 12000.00, 24000.00, 'active');

INSERT INTO payments (lease_id, amount, due_date, paid_date, status) VALUES
(1, 15000.00, '2026-02-01', '2026-02-01', 'paid'),
(1, 15000.00, '2026-03-01', '2026-03-02', 'paid'),
(1, 15000.00, '2026-04-01', NULL, 'pending'),
(2, 12000.00, '2026-03-01', '2026-03-01', 'paid'),
(2, 12000.00, '2026-04-01', NULL, 'pending');

INSERT INTO maintenance_requests (unit_id, tenant_id, description, status, priority) VALUES
(1, 2, 'Kitchen tap leaking', 'open', 'medium'),
(3, 3, 'AC not cooling properly', 'in_progress', 'high');
