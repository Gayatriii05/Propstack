const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DB_NAME = process.env.TEST_DB_NAME || 'propstack_test';
const CONTROL_URL =
  process.env.CONTROL_DATABASE_URL || 'postgres://postgres:propstack123@localhost:5432/postgres';
const TEST_URL =
  process.env.TEST_DATABASE_URL || `postgres://postgres:propstack123@localhost:5432/${DB_NAME}`;

module.exports = async () => {
  const control = new Pool({ connectionString: CONTROL_URL });
  const exists = await control.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) {
    await control.query(`CREATE DATABASE ${DB_NAME}`);
  }
  await control.end();

  // Rebuild from scratch so schema.sql/triggers.sql can always run cleanly.
  const dropPool = new Pool({ connectionString: TEST_URL, max: 1 });
  await dropPool.query(
    `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
  );
  await dropPool.end();

  const pool = new Pool({ connectionString: TEST_URL, max: 1 });
  const sqlDir = path.join(__dirname, '..', 'src', 'db');
  for (const file of ['schema.sql', 'triggers.sql', 'views.sql']) {
    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
    await pool.query(sql);
  }
  await pool.end();
};