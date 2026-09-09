-- ============================================================
-- PropStack — Core Schema (PostgreSQL)
-- Design notes (for interview defense):
--  - Every FK enforces referential integrity (no orphaned rows)
--  - ENUM types used instead of raw strings for status columns
--    -> saves storage, enforces valid values at DB level (not just app)
--  - Multi-tenancy is enforced via owner_id/tenant_id chains, and
--    ALL scoped queries in controllers filter by these — never trust
--    the frontend to only show "your" data
--  - Schema is normalized to 3NF:
--    1NF: every column atomic (no comma-separated lists etc.)
--    2NF: no partial dependency on a composite key (we don't use
--         composite PKs here, so 2NF is automatically satisfied)
--    3NF: no transitive dependency — e.g. property city doesn't
--         live on units, unit rent doesn't live on leases redundantly
--         beyond what's needed for historical lease pricing (see note
--         on leases.monthly_rent below — that's an intentional
--         denormalization, be ready to explain why)
-- ============================================================

DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('owner', 'manager', 'tenant');

DROP TYPE IF EXISTS unit_status CASCADE;
CREATE TYPE unit_status AS ENUM ('vacant', 'occupied');

DROP TYPE IF EXISTS lease_status CASCADE;
CREATE TYPE lease_status AS ENUM ('active', 'ended', 'terminated');

DROP TYPE IF EXISTS payment_status CASCADE;
CREATE TYPE payment_status AS ENUM ('paid', 'pending', 'overdue');

DROP TYPE IF EXISTS maintenance_status CASCADE;
CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'resolved');

DROP TYPE IF EXISTS maintenance_priority CASCADE;
CREATE TYPE maintenance_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120)  NOT NULL,
    email         VARCHAR(160)  NOT NULL UNIQUE,
    password_hash TEXT          NOT NULL,
    role          user_role     NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- PROPERTIES  (owned by a user with role='owner')
-- ------------------------------------------------------------
CREATE TABLE properties (
    id         SERIAL PRIMARY KEY,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       VARCHAR(150) NOT NULL,
    address    VARCHAR(255) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_owner ON properties(owner_id);

-- ------------------------------------------------------------
-- UNITS
-- ------------------------------------------------------------
CREATE TABLE units (
    id           SERIAL PRIMARY KEY,
    property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_number  VARCHAR(20) NOT NULL,
    rent_amount  NUMERIC(10,2) NOT NULL CHECK (rent_amount >= 0),
    status       unit_status NOT NULL DEFAULT 'vacant',
    bedrooms     SMALLINT NOT NULL DEFAULT 1 CHECK (bedrooms >= 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (property_id, unit_number)   -- no duplicate unit numbers within one property
);
CREATE INDEX idx_units_property ON units(property_id);

-- ------------------------------------------------------------
-- LEASES
-- NOTE on denormalization: monthly_rent is copied from units.rent_amount
-- at lease-signing time. This is intentional — if the owner later raises
-- rent on the unit, past/active leases should NOT silently change price.
-- This is a classic "be ready to explain" interview point about when
-- denormalization is the *correct* choice.
-- ------------------------------------------------------------
CREATE TABLE leases (
    id               SERIAL PRIMARY KEY,
    unit_id          INTEGER NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    tenant_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    monthly_rent     NUMERIC(10,2) NOT NULL CHECK (monthly_rent >= 0),
    security_deposit NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
    status           lease_status NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_date > start_date)
);
CREATE INDEX idx_leases_unit ON leases(unit_id);
CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_status ON leases(status);

-- Only one ACTIVE lease per unit at a time (partial unique index —
-- a great "advanced SQL" talking point: unique constraint with a WHERE clause)
CREATE UNIQUE INDEX uq_one_active_lease_per_unit
    ON leases(unit_id)
    WHERE status = 'active';

-- ------------------------------------------------------------
-- PAYMENTS
-- ------------------------------------------------------------
CREATE TABLE payments (
    id               SERIAL PRIMARY KEY,
    lease_id         INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
    amount           NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    due_date         DATE NOT NULL,
    paid_date        DATE,
    status           payment_status NOT NULL DEFAULT 'pending',
    late_fee_applied NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (late_fee_applied >= 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_lease ON payments(lease_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);

-- ------------------------------------------------------------
-- MAINTENANCE REQUESTS
-- ------------------------------------------------------------
CREATE TABLE maintenance_requests (
    id          SERIAL PRIMARY KEY,
    unit_id     INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    tenant_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status      maintenance_status NOT NULL DEFAULT 'open',
    priority    maintenance_priority NOT NULL DEFAULT 'medium',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_maintenance_unit ON maintenance_requests(unit_id);
CREATE INDEX idx_maintenance_tenant ON maintenance_requests(tenant_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
