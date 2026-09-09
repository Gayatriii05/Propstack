const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // e.g. postgres://user:pass@localhost:5432/propstack
});

pool.on('error', (err) => {
  console.error('Unexpected PG pool error', err);
  process.exit(-1);
});

module.exports = pool;
