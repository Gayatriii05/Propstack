const pool = require('../config/db');

// GET /api/properties  (owner sees only their own — multi-tenancy at query level)
async function listProperties(req, res) {
  try {
    const result = await pool.query(
      'SELECT * FROM properties WHERE owner_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
}

// POST /api/properties
async function createProperty(req, res) {
  const { name, address, city } = req.body;
  if (!name || !address || !city) {
    return res.status(400).json({ error: 'name, address, city are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO properties (owner_id, name, address, city)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, name, address, city]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create property' });
  }
}

// Helper used by other controllers to verify ownership before nested writes
async function assertOwnsProperty(propertyId, ownerId) {
  const result = await pool.query(
    'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
    [propertyId, ownerId]
  );
  return result.rows.length > 0;
}

module.exports = { listProperties, createProperty, assertOwnsProperty };
