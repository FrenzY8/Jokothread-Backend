const { Pool } = require('pg');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

db.on('connect', () => {
  console.log('Connected to Supabase PostgreSQL!');
});

db.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

module.exports = db;