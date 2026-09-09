const pool = require('../config/db');

// GET /api/leases  — role-scoped:
//   owner   -> all leases across their properties
//   tenant  -> only their own leases
// Supports pagination via ?page&limit (defaults: page=1, limit=20, max 100)
async function listLeases(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    let countQuery, countParams, query, params;

    if (req.user.role === 'owner') {
      countQuery = `
        SELECT COUNT(*)
        FROM leases l
        JOIN units u ON u.id = l.unit_id
        JOIN properties p ON p.id = u.property_id
        JOIN users usr ON usr.id = l.tenant_id
        WHERE p.owner_id = $1`;
      countParams = [req.user.id];
      query = `
        SELECT l.*, u.unit_number, p.name AS property_name, usr.name AS tenant_name
        FROM leases l
        JOIN units u ON u.id = l.unit_id
        JOIN properties p ON p.id = u.property_id
        JOIN users usr ON usr.id = l.tenant_id
        WHERE p.owner_id = $1
        ORDER BY l.created_at DESC
        LIMIT $2 OFFSET $3`;
      params = [req.user.id, limit, offset];
    } else if (req.user.role === 'tenant') {
      countQuery = `
        SELECT COUNT(*)
        FROM leases l
        JOIN units u ON u.id = l.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE l.tenant_id = $1`;
      countParams = [req.user.id];
      query = `
        SELECT l.*, u.unit_number, p.name AS property_name
        FROM leases l
        JOIN units u ON u.id = l.unit_id
        JOIN properties p ON p.id = u.property_id
        WHERE l.tenant_id = $1
        ORDER BY l.created_at DESC
        LIMIT $2 OFFSET $3`;
      params = [req.user.id, limit, offset];
    } else {
      return res.status(403).json({ error: 'Role not permitted' });
    }

    const [countRes, result] = await Promise.all([
      pool.query(countQuery, countParams),
      pool.query(query, params),
    ]);

    const total = parseInt(countRes.rows[0].count, 10);
    res.json({
      data: result.rows,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leases' });
  }
}

// POST /api/leases  (owner only — verified via requireRole in route)
async function createLease(req, res) {
  const { unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit } = req.body;
  if (!unit_id || !tenant_id || !start_date || !end_date || monthly_rent == null) {
    return res.status(400).json({ error: 'unit_id, tenant_id, start_date, end_date, monthly_rent are required' });
  }

  try {
    // Ownership check: does this owner actually own the property this unit belongs to?
    const ownsUnit = await pool.query(
      `SELECT u.id FROM units u
       JOIN properties p ON p.id = u.property_id
       WHERE u.id = $1 AND p.owner_id = $2`,
      [unit_id, req.user.id]
    );
    if (ownsUnit.rows.length === 0) {
      return res.status(403).json({ error: 'Not your unit' });
    }

    const result = await pool.query(
      `INSERT INTO leases (unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [unit_id, tenant_id, start_date, end_date, monthly_rent, security_deposit || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      // hits uq_one_active_lease_per_unit partial unique index
      return res.status(409).json({ error: 'This unit already has an active lease' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create lease' });
  }
}

module.exports = { listLeases, createLease };
