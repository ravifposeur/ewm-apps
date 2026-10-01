// service/src/store/index.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function findEventById(id) {
  const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
  const event = result.rows[0];
  if (!event) return null;

  // Load assigned admins (Layer 3)
  const admins = await pool.query(
    'SELECT admin_id FROM event_admins WHERE event_id = $1',
    [id]
  );
  event._assigned_admin_ids = admins.rows.map((r) => r.admin_id);
  return event;
}

async function findAllEvents(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.organizerId) {
    values.push(filters.organizerId);
    // Match owner OR assigned admin
    conditions.push(
      `(e.organizer_id = $${values.length} OR ea.admin_id = $${values.length})`
    );
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`e.status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 20;
  values.push(limit);

  const sql = `
    SELECT DISTINCT e.* FROM events e
    LEFT JOIN event_admins ea ON ea.event_id = e.id
    ${where}
    ORDER BY e.created_at DESC
    LIMIT $${values.length}
  `;
  const result = await pool.query(sql, values);

  // Load assigned admins untuk setiap event (biar konsisten dengan findEventById)
  for (const event of result.rows) {
    const admins = await pool.query(
      'SELECT admin_id FROM event_admins WHERE event_id = $1',
      [event.id]
    );
    event._assigned_admin_ids = admins.rows.map((r) => r.admin_id);
  }

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
  const id = `site_${Date.now()}`;
  const result = await pool.query(
    `INSERT INTO sites (id, event_id, area_name, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, siteData.eventId, siteData.areaName || siteData.name, 'proposed']
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
  const id = `rost_${Date.now()}`;
  const result = await pool.query(
    `INSERT INTO rosters (id, event_id, site_id, crew_id, crew_name, shift_start, shift_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      id,
      rosterData.eventId,
      rosterData.siteId,
      rosterData.crewId,
      rosterData.crewName,
      rosterData.shiftStart,
      rosterData.shiftEnd,
    ]
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
