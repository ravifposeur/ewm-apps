// service/src/routes/events.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const store = require('../store');
const { representEvent, representEventList } = require('../representations/event');
const { sendProblem } = require('../problem');
const { listEventsQuerySchema, createEventSchema } = require('../schemas/events');
const { confirmationSchema } = require('../schemas/confirmation');
const engine = require('../business/engine');

const { requireScope } = require('../auth/require-scope');
const ownership = require('../auth/ownership');

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Uniform 404 (missing OR not-owned)
function notFound(res, req, id) {
  return sendProblem(res, 'not-found', 'Not Found', 404,
    `Resource '${id}' was not found or is unavailable`, req.originalUrl);
}

function notImplemented(res, req) {
  return sendProblem(res, 'not-implemented', 'Not Implemented', 501,
    `Endpoint ${req.method} ${req.originalUrl} is planned but not yet implemented`,
    req.originalUrl);
}

// ==========================================================================
// GET /events — list (owner filter at SQL layer)
// ==========================================================================
router.get('/', requireScope('events:read'), async (req, res, next) => {
  try {
    const { error, value } = listEventsQuerySchema.validate(req.query, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-query', 'Bad Request', 400, error.message, req.originalUrl);
    }
    const filters = { ...value };
    if (!ownership.isService(req.principal)) {
      filters.organizerId = req.principal.subject;
    }
    const rows = await store.findAllEvents(filters);
    return res.status(200).json(representEventList(rows || []));
  } catch (err) { next(err); }
});

// ==========================================================================
// POST /events — create
// ==========================================================================
router.post('/', requireScope('events:write'), async (req, res, next) => {
  try {
    const { error, value } = createEventSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Bad Request', 400, error.message, req.originalUrl,
        { invalidFields: error.details });
    }
    const payload = { ...value, organizerId: req.principal.subject };
    const row = await store.insertEvent(payload);
    return res.status(201).location(`/v1/events/${row.id}`).json(representEvent(row));
  } catch (err) { next(err); }
});

// ==========================================================================
// POST /events/:eventId/daily-confirmation — UNSAFE (MUST be before /:eventId)
// ==========================================================================
router.post('/:eventId/daily-confirmation', requireScope('confirmations:write'), async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key header is required', req.originalUrl);
    }
    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key must be a valid UUID v4', req.originalUrl);
    }
    if (!VALID_ID_REGEX.test(eventId)) {
      return sendProblem(res, 'invalid-id', 'Bad Request', 400,
        `Malformed event ID: '${eventId}'`, req.originalUrl);
    }

    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const existing = await store.findIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.body_hash === bodyHash) return res.status(200).json(existing.response);
      return sendProblem(res, 'idempotency-key-reuse', 'Conflict', 409,
        'Idempotency-Key reused with different body', req.originalUrl,
        { expectedHash: existing.body_hash });
    }

    const { error, value } = confirmationSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Bad Request', 400, error.message, req.originalUrl,
        { invalidFields: error.details });
    }

    const event = await store.findEventById(eventId);
    if (!event || !ownership.mayConfirmEvent(req.principal, event)) {
      return notFound(res, req, eventId);
    }

    const records = await store.findCollectionsByEventId(eventId);
    const recordedTotal = (records || []).reduce((s, r) => s + (r.weight || 0), 0);
    const multiplier = parseFloat(event.points_multiplier) || 0.5;
    const targetWeight = event.target_weight || 0;

    const actualTotal = engine.calculateTotalWeight(value.verifiedBreakdown);
    const deviation = engine.calculateDeviation(recordedTotal, actualTotal);
    if (deviation > 10) {
      return sendProblem(res, 'deviation-too-high', 'Unprocessable Entity', 422,
        `Deviation ${deviation.toFixed(2)}% > 10%`, req.originalUrl,
        { deviationPercentage: parseFloat(deviation.toFixed(2)) });
    }

    const totalPoints = engine.calculateTotalPoints(value.verifiedBreakdown, multiplier);
    const grade = engine.determineGrade(totalPoints);
    const hazmatWeight = value.verifiedBreakdown
      .filter((i) => i.wasteType === 'HAZMAT')
      .reduce((s, i) => s + i.weight, 0);

    const responseBody = {
      eventId, recordedTotal, verifiedTotal: actualTotal,
      hazmatDeducted: hazmatWeight, totalPoints, grade,
      targetMet: actualTotal >= targetWeight,
      certificateUrl: `/reports/cert_${eventId}.pdf`,
      reportUrl: `/reports/report_${eventId}.pdf`,
      verifiedBreakdown: value.verifiedBreakdown,
    };

    await store.insertIdempotencyKey(idempotencyKey, bodyHash, { status: 200, ...responseBody });
    return res.status(200).json(responseBody);
  } catch (err) { next(err); }
});

// ==========================================================================
// Sub-resources of event (stubs — Layer 2 mounted, work TODO)
// ==========================================================================
router.get('/:eventId/progress', requireScope('events:read'), (req, res) => notImplemented(res, req));
router.get('/:eventId/sites', requireScope('events:read'), (req, res) => notImplemented(res, req));
router.post('/:eventId/sites', requireScope('events:write'), (req, res) => notImplemented(res, req));
router.post('/:eventId/site-approval', requireScope('sites:approve'), (req, res) => notImplemented(res, req));

// ==========================================================================
// GET /events/:eventId — single entity (MUST be last)
// ==========================================================================
router.get('/:eventId', requireScope('events:read'), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    if (!VALID_ID_REGEX.test(eventId)) {
      return sendProblem(res, 'invalid-id', 'Bad Request', 400,
        `Malformed event ID: '${eventId}'`, req.originalUrl);
    }
    const event = await store.findEventById(eventId);
    if (!event || !ownership.mayReadEvent(req.principal, event)) {
      return notFound(res, req, eventId);
    }
    return res.status(200).json(representEvent(event));
  } catch (err) { next(err); }
});

module.exports = router;
