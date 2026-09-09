# PropStack — Multi-Tenant Property & Lease Management System

A full-stack SaaS-style platform for property owners to manage properties, units,
leases, rent payments, and maintenance requests — built to demonstrate advanced
PostgreSQL usage (triggers, window functions, views, partial unique indexes),
a hardened Express API, and a React + Tailwind frontend.

## Features

- **Multi-tenant, role-based platform** — distinct Owner and Tenant dashboards with
  server-side data scoping; ownership/tenant-tenancy is enforced at the SQL query
  layer, never just hidden in the UI.
- **JWT + bcrypt authentication** with role-based access control (`owner` /
  `manager` / `tenant`) and route protection on every API call.
- **Owner dashboard** — manage properties, units, and leases; view occupancy and
  monthly revenue reports; chart cumulative revenue (running total) over time.
- **Tenant dashboard** — view active lease, payment history, mark rent paid,
  raise maintenance tickets, and track ticket status in real time.
- **SQL-driven reporting** — window functions (`RANK()`, running `SUM() OVER`)
  power the top-units and cumulative-revenue reports; normalized 3NF schema with
  FK/CHECK constraints and ENUM types.
- **Database triggers** — automatic late-fee application (5% once per row) and
  automatic unit status sync (occupied/vacant) on lease changes, enforced at the
  data layer.
- **Hardened API** — rate limiting on auth routes (5 req/min), zod request
  validation on every POST/PATCH (clear 400s), and pagination on lease/payment
  list endpoints.
- **Tested + CI** — Jest integration suite (auth + payment flows including the
  late-fee trigger) runs against a real PostgreSQL test database; GitHub Actions
  workflow runs it on every push.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + Recharts (JWT held in memory, never localStorage)
- **Backend**: Node.js + Express + pg
- **DB**: PostgreSQL (schema, triggers, and views all in SQL)
- **Auth**: JWT + bcrypt
- **Tests/CI**: Jest + Supertest, GitHub Actions

## Project layout

```
propstack/
  backend/            # Express API
    src/
      config/db.js    # pg Pool
      db/             # schema.sql, triggers.sql, views.sql, seed.sql
      controllers/    # one per resource
      routes/         # one per resource
      middleware/     # auth (JWT + roles), validate (zod)
      validators.js   # zod schemas for every POST/PATCH
    tests/            # Jest integration suites
  frontend/           # React + Vite + Tailwind
    src/
      pages/          # Login, Register, OwnerDashboard, TenantDashboard
      context/        # AuthContext (JWT in memory)
      components/     # ProtectedRoute, Layout
  .github/workflows/ci.yml
```

## Backend setup

Requirements: Node 18+ and PostgreSQL 14+ (tested on Node 22 / PostgreSQL 17).

```bash
cd backend
npm install
cp .env.example .env      # set DATABASE_URL + a long random JWT_SECRET
# create the database:  psql -U postgres -c "CREATE DATABASE propstack;"
npm run db:setup          # runs schema.sql -> triggers.sql -> views.sql -> seed.sql
npm run dev               # http://localhost:5000
```

Seed users (password `password123`):

| Email | Role |
|---|---|
| `owner@propstack.com` | owner |
| `tenant1@propstack.com` | tenant |
| `tenant2@propstack.com` | tenant |

> To change seed passwords, generate real bcrypt hashes with
> `node src/utils/hashPassword.js "<plaintext>"` and paste them into
> `src/db/seed.sql`.

## Frontend setup

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173  (proxies /api -> :5000)
```

Log in with any seed account above. The Vite dev server proxies `/api` to the
backend, so both servers must be running.

## Running tests

```bash
cd backend
npm test                  # creates/resets propstack_test DB automatically
```

Tests use a separate `propstack_test` database (`TEST_DATABASE_URL` env var
overrides its connection string) and reset the schema on every run.

## API overview

| Method & path | Auth | Description |
|---|---|---|
| POST /api/auth/register | — | Create user (rate-limited 5/min) |
| POST /api/auth/login | — | Login (rate-limited 5/min) |
| GET /api/properties | owner/manager | List own properties |
| POST /api/properties | owner | Create property |
| GET /api/units/:propertyId | any | List units for a property |
| POST /api/units | owner | Create unit |
| GET /api/leases?page=&limit= | owner/tenant | List leases (paginated) |
| POST /api/leases | owner | Create lease |
| GET /api/payments/:leaseId?page=&limit= | owner/tenant | Payments for lease (paginated) |
| POST /api/payments | owner/manager | Schedule a payment |
| PATCH /api/payments/:id/mark-paid | owner/manager/tenant | Mark payment paid |
| GET /api/reports/occupancy | owner/manager | Occupancy report |
| GET /api/reports/revenue | owner/manager | Monthly revenue report |
| GET /api/reports/top-units | owner/manager | Rank units by revenue (window fn) |
| GET /api/reports/running-total | owner/manager | Cumulative revenue (window fn) |
| POST /api/maintenance | tenant | Raise a maintenance ticket |
| PATCH /api/maintenance/:id/status | owner/manager | Update ticket status |
| GET /health | — | Liveness check |"# Propstack" 
"# Propstack" 
