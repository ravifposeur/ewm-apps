// service/src/store/index.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function findEventById(id) {
  const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
  return result.rows[0];
}

async function findAllEvents() {
  const result = await pool.query('SELECT * FROM events');
  return result.rows;
}

async function findIdempotencyKey(key) {
  const result = await pool.query(
    'SELECT key, body_hash, response FROM idempotency_keys WHERE key = $1',
    [key]
  );
  return result.rows[0];
}

async function insertIdempotencyKey(key, bodyHash, response) {
  await pool.query(
    'INSERT INTO idempotency_keys (key, body_hash, response) VALUES ($1, $2, $3)',
    [key, bodyHash, JSON.stringify(response)]
  );
}

async function findCollectionsByEventId(eventId) {
  const result = await pool.query(
    'SELECT * FROM collection_records WHERE event_id = $1',
    [eventId]
  );
  return result.rows;
}

module.exports = {
  findEventById,
  findAllEvents,
  findIdempotencyKey,
  insertIdempotencyKey,
  findCollectionsByEventId,
  pool,
};
