const pool = require('../config/db');
const { assertOwnsProperty } = require('./propertyController');

// GET /api/units/:propertyId
async function listUnitsForProperty(req, res) {
  const { propertyId } = req.params;
  try {
    if (req.user.role === 'owner') {
      const owns = await assertOwnsProperty(propertyId, req.user.id);
      if (!owns) return res.status(403).json({ error: 'Not your property' });
    }
    const result = await pool.query(
      'SELECT * FROM units WHERE property_id = $1 ORDER BY unit_number',
      [propertyId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
}

// POST /api/units
async function createUnit(req, res) {
  const { property_id, unit_number, rent_amount, bedrooms } = req.body;
  if (!property_id || !unit_number || rent_amount == null) {
    return res.status(400).json({ error: 'property_id, unit_number, rent_amount are required' });
  }
  try {
    const owns = await assertOwnsProperty(property_id, req.user.id);
    if (!owns) return res.status(403).json({ error: 'Not your property' });

    const result = await pool.query(
      `INSERT INTO units (property_id, unit_number, rent_amount, bedrooms)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [property_id, unit_number, rent_amount, bedrooms || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation (property_id, unit_number)
      return res.status(409).json({ error: 'Unit number already exists on this property' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create unit' });
  }
}

module.exports = { listUnitsForProperty, createUnit };
