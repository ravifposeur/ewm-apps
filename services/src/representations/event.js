// services/src/representations/event.js

/**
 * Valid OpenAPI event statuses: draft, active, verifying, completed
 */
const VALID_STATUSES = ['draft', 'active', 'verifying', 'completed'];

/**
 * Transforms a raw database row into an OpenAPI compliant Event representation.
 * @param {object} row - Raw database row from events table
 * @returns {object} OpenAPI Event schema compliant object
 */
function representEvent(row) {
  if (!row) return null;

  // Map status: OpenAPI rule states "Clients MUST treat unrecognised status as 'draft'."
  const status = VALID_STATUSES.includes(row.status) ? row.status : 'draft';

  const event = {
    id: String(row.id),
    organizerId: row.organizer_id || row.organizerId || 'eo_default',
    name: String(row.name),
    status: status,
  };

  if (row.scheduled_date || row.scheduledDate) {
    event.scheduledDate = row.scheduled_date || row.scheduledDate;
  }

  if (row.target_weight !== undefined && row.target_weight !== null) {
    event.targetWeight = parseInt(row.target_weight, 10);
  } else if (row.targetWeight !== undefined && row.targetWeight !== null) {
    event.targetWeight = parseInt(row.targetWeight, 10);
  }

  if (row.points_multiplier !== undefined && row.points_multiplier !== null) {
    event.pointsMultiplier = parseFloat(row.points_multiplier);
  } else if (row.pointsMultiplier !== undefined && row.pointsMultiplier !== null) {
    event.pointsMultiplier = parseFloat(row.pointsMultiplier);
  }

  if (row.bonus_multiplier !== undefined && row.bonus_multiplier !== null) {
    event.bonusMultiplier = parseFloat(row.bonus_multiplier);
  } else if (row.bonusMultiplier !== undefined && row.bonusMultiplier !== null) {
    event.bonusMultiplier = parseFloat(row.bonusMultiplier);
  }

  if (row.extensions && typeof row.extensions === 'object') {
    event.extensions = row.extensions;
  }

  return event;
}

/**
 * Transforms an array of raw database rows into an array of Event representations.
 * @param {Array<object>} rows - Array of database rows
 * @returns {Array<object>} Array of OpenAPI Event schema compliant objects
 */
function representEventList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(representEvent);
}

module.exports = {
  representEvent,
  representEventList,
};
