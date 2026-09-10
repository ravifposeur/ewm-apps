const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
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
    const result = await pool.query('SELECT key FROM idempotency_keys WHERE key = $1', [key]);
    return result.rows[0];
}

async function insertIdempotencyKey(key) {
    await pool.query('INSERT INTO idempotency_keys (key) VALUES ($1)', [key]);
}

module.exports = {
    findEventById,
    findAllEvents,
    findIdempotencyKey,
    insertIdempotencyKey
};
