const pool = require('../config/db');

// GET /api/maintenance/:unitId
async function listRequestsForUnit(req, res) {
  const { unitId } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM maintenance_requests WHERE unit_id = $1 ORDER BY created_at DESC',
      [unitId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch maintenance requests' });
  }
}

// POST /api/maintenance  (tenant raises a ticket)
async function createRequest(req, res) {
  const { unit_id, description, priority } = req.body;
  if (!unit_id || !description) {
    return res.status(400).json({ error: 'unit_id and description are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO maintenance_requests (unit_id, tenant_id, description, priority)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [unit_id, req.user.id, description, priority || 'medium']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create request' });
  }
}

// PATCH /api/maintenance/:id/status  (owner/manager updates ticket)
async function updateStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const result = await pool.query(
      'UPDATE maintenance_requests SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update request' });
  }
}

module.exports = { listRequestsForUnit, createRequest, updateStatus };
