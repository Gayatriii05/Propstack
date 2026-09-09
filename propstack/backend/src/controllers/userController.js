const pool = require('../config/db');

// GET /api/users?role=tenant  (owner/manager only)
// Returns id, name, email. Never exposes password_hash.
async function listUsers(req, res) {
  const { role } = req.query;
  try {
    const params = [];
    let query = 'SELECT id, name, email FROM users';
    if (role) {
      query += ' WHERE role = $1';
      params.push(role);
    }
    query += ' ORDER BY name';

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

module.exports = { listUsers };