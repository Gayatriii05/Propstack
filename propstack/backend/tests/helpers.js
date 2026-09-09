process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:propstack123@localhost:5432/propstack_test';
process.env.JWT_SECRET = 'test-secret';

// Rate limiting is real in the running app; tests bypass it to stay deterministic.
jest.mock('express-rate-limit', () => jest.fn().mockImplementation(() => (req, res, next) => next()));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const pool = require('../src/config/db');
const app = require('../src/app');

async function resetDb() {
  await pool.query(
    'TRUNCATE users, properties, units, leases, payments, maintenance_requests RESTART IDENTITY CASCADE'
  );
}

async function createUser(name, email, role, password = 'password123') {
  const password_hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role`,
    [name, email, password_hash, role]
  );
  return rows[0];
}

function tokenFor(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function createLeaseFixture() {
  const owner = await createUser('Test Owner', 'owner@test.com', 'owner');
  const tenant = await createUser('Test Tenant', 'tenant@test.com', 'tenant');
  const { rows: [property] } = await pool.query(
    `INSERT INTO properties (owner_id, name, address, city)
     VALUES ($1, 'Sunrise', '12 MG Road', 'Nagpur') RETURNING *`,
    [owner.id]
  );
  const { rows: [unit] } = await pool.query(
    `INSERT INTO units (property_id, unit_number, rent_amount, status)
     VALUES ($1, 'A101', 1000.00, 'occupied') RETURNING *`,
    [property.id]
  );
  const { rows: [lease] } = await pool.query(
    `INSERT INTO leases (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit)
     VALUES ($1, $2, '2026-01-01', '2026-12-31', 1000.00, 2000.00) RETURNING *`,
    [unit.id, tenant.id]
  );
  return { owner, tenant, property, unit, lease };
}

async function createPayment(leaseId, amount, dueDate, paidDate = null) {
  const { rows: [payment] } = await pool.query(
    `INSERT INTO payments (lease_id, amount, due_date, paid_date, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [leaseId, amount, dueDate, paidDate, paidDate ? 'paid' : 'pending']
  );
  return payment;
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, app, request, resetDb, createUser, tokenFor, createLeaseFixture, createPayment, closePool };