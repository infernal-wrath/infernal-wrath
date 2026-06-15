const { Pool } = require('pg');

// DATABASE_URL is set automatically by Railway when you add a Postgres plugin,
// or you paste the Supabase connection string into your Railway environment variables.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Database connection error:', err.message);
});

module.exports = pool;
