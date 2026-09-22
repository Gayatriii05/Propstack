const pool = require('../config/db');

// Runs a generated SELECT on a connection that is hard-set to READ ONLY
// inside a transaction that is ALWAYS rolled back — a second independent
// safety net underneath the keyword denylist. Even if the validator had a
// bug, this connection physically cannot write.
async function runReadOnlySelect(sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const result = await client.query(sql, params);
    await client.query('ROLLBACK');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runReadOnlySelect };