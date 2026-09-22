const pool = require('../config/db');

// Shared scope check for ALL lease-level reads/writes:
// the user must be the tenant on the lease OR the owner of the property
// the lease's unit belongs to. Never trust the frontend to gate this.
async function canAccessLease(userId, leaseId) {
  const result = await pool.query(
    `SELECT l.id FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE l.id = $1 AND (l.tenant_id = $2 OR p.owner_id = $2)`,
    [leaseId, userId]
  );
  return result.rows.length > 0;
}

// GET /api/payments/:leaseId
// Supports pagination via ?page&limit (defaults: page=1, limit=20, max 100)
async function listPaymentsForLease(req, res) {
  const { leaseId } = req.params;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  try {
    // Scope check: tenant can only view their own lease's payments;
    // owner can only view payments on leases within their properties.
    if (!(await canAccessLease(req.user.id, leaseId))) {
      return res.status(403).json({ error: 'Not authorized for this lease' });
    }

    const [countRes, result] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM payments WHERE lease_id = $1', [leaseId]),
      pool.query(
        `SELECT * FROM payments WHERE lease_id = $1
         ORDER BY due_date DESC
         LIMIT $2 OFFSET $3`,
        [leaseId, limit, offset]
      ),
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
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
}

// POST /api/payments  (owner/manager schedules an expected payment on a lease they own)
async function createPayment(req, res) {
  const { lease_id, amount, due_date } = req.body;
  if (!lease_id || amount == null || !due_date) {
    return res.status(400).json({ error: 'lease_id, amount, due_date are required' });
  }
  try {
    // Scope check: the lease must belong to the requester's property
    // (or the requester must be the tenant on it) before any write.
    if (!(await canAccessLease(req.user.id, lease_id))) {
      return res.status(403).json({ error: 'Not authorized for this lease' });
    }

    const result = await pool.query(
      `INSERT INTO payments (lease_id, amount, due_date)
       VALUES ($1, $2, $3) RETURNING *`,
      [lease_id, amount, due_date]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
}

// PATCH /api/payments/:id/mark-paid
async function markPaid(req, res) {
  const { id } = req.params;
  try {
    // Resolve the lease this payment belongs to, then apply the same
    // scope check as every other lease-level operation.
    const leaseLookup = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (leaseLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    const payment = leaseLookup.rows[0];
    if (!(await canAccessLease(req.user.id, payment.lease_id))) {
      return res.status(403).json({ error: 'Not authorized for this lease' });
    }

    // Already paid: return the row untouched — never re-stamp paid_date.
    if (payment.status === 'paid') {
      return res.json(payment);
    }

    const result = await pool.query(
      `UPDATE payments
       SET status = 'paid', paid_date = CURRENT_DATE
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
}

module.exports = { listPaymentsForLease, createPayment, markPaid };
