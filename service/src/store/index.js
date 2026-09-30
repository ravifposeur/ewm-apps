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

async function insertManyCollections(records, eventId, rosterId) {
  for (const r of records) {
    await pool.query(
      `INSERT INTO collection_records
       (event_id, roster_id, site_id, waste_type, weight, recorded_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, rosterId, r.siteId, r.wasteType, r.weight, r.recordedAt || new Date(), 'recorded']
    );
  }
}

async function findRosterById(id) {
  const result = await pool.query('SELECT * FROM rosters WHERE id = $1', [id]);
  return result.rows[0];
}

async function insertEvent(payload) {
  // Generate ID unik, misalnya menggunakan prefix 'evt_'
  const eventId = `evt_${Date.now()}`; 
  
  // Mapping dari camelCase (Joi) ke snake_case (Kolom DB)
  const result = await pool.query(
    `INSERT INTO events 
    (id, name, organizer_id, scheduled_date, target_weight, points_multiplier, bonus_multiplier, status) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      eventId,
      payload.name,
      payload.organizerId, 
      payload.scheduledDate || null,
      payload.targetWeight || 0,
      payload.pointsMultiplier || 1.0, 
      payload.bonusMultiplier || 1.0,
      'draft' // Status awal standar, disesuaikan dengan enum status di openapi.yaml
    ]
  );
  return result.rows[0];
}

async function findSiteById(id) {
  const result = await pool.query('SELECT * FROM sites WHERE id = $1', [id]);
  return result.rows[0];
}

async function findAllSitesByEventId(eventId) {
  const result = await pool.query('SELECT * FROM sites WHERE event_id = $1', [eventId]);
  return result.rows;
}

async function insertSite(siteData) {
  const result = await pool.query(
    'INSERT INTO sites (id, event_id, name, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [siteData.id, siteData.eventId, siteData.name, 'pending'] // asumsi status awal 'pending'
  );
  return result.rows[0];
}

async function updateAllSitesStatus(eventId, status) {
  await pool.query(
    'UPDATE sites SET status = $1 WHERE event_id = $2',
    [status, eventId]
  );
}

async function findRostersByEventId(eventId) {
  const result = await pool.query('SELECT * FROM rosters WHERE event_id = $1', [eventId]);
  return result.rows;
}

async function insertRoster(rosterData) {
  const result = await pool.query(
    'INSERT INTO rosters (id, event_id, user_id, role) VALUES ($1, $2, $3, $4) RETURNING *',
    [rosterData.id, rosterData.eventId, rosterData.userId, rosterData.role]
  );
  return result.rows[0];
}

module.exports = {
  findEventById,
  findAllEvents,
  findIdempotencyKey,
  findRosterById,
  insertIdempotencyKey,
  findCollectionsByEventId,
  insertManyCollections,
  insertEvent,
  findSiteById,
  findAllSitesByEventId,
  insertSite,
  updateAllSitesStatus,
  findRostersByEventId,
  insertRoster,
  pool,
};
