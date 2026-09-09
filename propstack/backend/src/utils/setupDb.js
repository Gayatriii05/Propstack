require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const files = ['schema.sql', 'triggers.sql', 'views.sql', 'seed.sql'];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
    console.log(`Running ${file} ...`);
    await pool.query(sql);
  }
  console.log('Database setup complete.');
  await pool.end();
}

run().catch((err) => {
  console.error('DB setup failed:', err);
  process.exit(1);
});
