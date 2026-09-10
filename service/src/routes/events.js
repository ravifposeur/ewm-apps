// service/src/routes/events.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const store = require('../store');
const { representEvent, representEventList } = require('../representations/event');
const { createProblem } = require('../problem');
const { listEventsQuerySchema } = require('../schemas/events');
const { confirmationSchema } = require('../schemas/confirmation');
const engine = require('../business/engine');

// Regex pattern for valid event IDs (alphanumeric, hyphens, underscores)
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

// UUID v4 regex untuk validasi Idempotency-Key
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper untuk kirim problem details
function sendProblem(res, type, title, status, detail, instance, extensions = {}) {
  const problem = createProblem(type, title, status, detail, instance);
  problem.type = `/problems/${type}`;
  Object.assign(problem, extensions);
  res.setHeader('Content-Type', 'application/problem+json');
  return res.status(status).json(problem);
}

/**
 * GET /events
 * List events with optional filtering by organizerId and status
 */
router.get('/', async (req, res, next) => {
  try {
    const { error, value } = listEventsQuerySchema.validate(req.query, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-query', 'Bad Request', 400, error.message, req.originalUrl);
    }

    const rawEvents = await store.findAllEvents();
    let filteredEvents = rawEvents || [];

    if (value.organizerId) {
      filteredEvents = filteredEvents.filter(
        (e) => (e.organizer_id || e.organizerId) === value.organizerId
      );
    }
    if (value.status) {
      filteredEvents = filteredEvents.filter((e) => e.status === value.status);
    }

    const representations = representEventList(filteredEvents);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(representations);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /events/:eventId/daily-confirmation
 * UNSAFE operation — memerlukan Idempotency-Key.
 * WAJIB didaftarkan SEBELUM route GET /:id agar tidak bentrok.
 */
router.post('/:eventId/daily-confirmation', async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // 1. Validasi Idempotency-Key
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return sendProblem(res, 'missing-idempotency-key',
        'Bad Request', 400, 'Idempotency-Key header is required', req.originalUrl);
    }
    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      return sendProblem(res, 'missing-idempotency-key',
        'Bad Request', 400, 'Idempotency-Key must be a valid UUID v4', req.originalUrl);
    }

    // 2. Validasi format eventId
    if (!eventId || !VALID_ID_REGEX.test(eventId)) {
      return sendProblem(res, 'invalid-id', 'Bad Request', 400,
        `Malformed event ID format: '${eventId}'`, req.originalUrl);
    }

    // 3. Cek idempotency key reuse
    const bodyHash = crypto.createHash('sha256')
      .update(JSON.stringify(req.body)).digest('hex');

    let existingKey = null;
    if (store.findIdempotencyKey) {
      existingKey = await store.findIdempotencyKey(idempotencyKey);
    }
    if (existingKey) {
      if (existingKey.body_hash === bodyHash) {
        return res.status(200).json(existingKey.response);
      } else {
        return sendProblem(res, 'idempotency-key-reuse',
          'Conflict', 409,
          'Idempotency-Key reused with different body',
          req.originalUrl,
          { expectedHash: existingKey.body_hash });
      }
    }

    // 4. Validasi body
    const { error, value } = confirmationSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Bad Request', 400,
        error.message, req.originalUrl, { invalidFields: error.details });
    }

    // 5. Ambil event dari store
    const event = await store.findEventById(eventId);
    if (!event) {
      return sendProblem(res, 'not-found', 'Event Not Found', 404,
        `Event with ID '${eventId}' was not found`, req.originalUrl);
    }

    // 6. Ambil collection records (jika store menyediakan)
    let recordedTotal = 0;
    if (store.findCollectionsByEventId) {
      const records = await store.findCollectionsByEventId(eventId);
      recordedTotal = (records || []).reduce((sum, r) => sum + (r.weight || 0), 0);
    }

    const multiplier = parseFloat(event.points_multiplier) || 0.5;
    const targetWeight = event.target_weight || 0;

    // 7. Hitung deviation
    const actualTotal = engine.calculateTotalWeight(value.verifiedBreakdown);
    const deviation = engine.calculateDeviation(recordedTotal, actualTotal);

    if (deviation > 10) {
      return sendProblem(res, 'deviation-too-high',
        'Unprocessable Entity', 422,
        `Deviation ${deviation.toFixed(2)}% > 10%`,
        req.originalUrl,
        { deviationPercentage: parseFloat(deviation.toFixed(2)) });
    }

    // 8. Hitung poin & grade
    const totalPoints = engine.calculateTotalPoints(value.verifiedBreakdown, multiplier);
    const grade = engine.determineGrade(totalPoints);
    const hazmatWeight = value.verifiedBreakdown
      .filter((i) => i.wasteType === 'HAZMAT')
      .reduce((sum, i) => sum + i.weight, 0);

    const responseBody = {
      eventId: eventId,
      recordedTotal: recordedTotal,
      verifiedTotal: actualTotal,
      hazmatDeducted: hazmatWeight,
      totalPoints: totalPoints,
      grade: grade,
      targetMet: actualTotal >= targetWeight,
      certificateUrl: `/reports/cert_${eventId}.pdf`,
      reportUrl: `/reports/report_${eventId}.pdf`,
      verifiedBreakdown: value.verifiedBreakdown,
    };

    // 9. Simpan idempotency key
    if (store.insertIdempotencyKey) {
      await store.insertIdempotencyKey(idempotencyKey, bodyHash, {
        status: 200,
        ...responseBody,
      });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(responseBody);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /events/:id
 * Get a single event by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || !VALID_ID_REGEX.test(id)) {
      return sendProblem(res, 'invalid-id', 'Bad Request', 400,
        `Malformed event ID format: '${id}'`, req.originalUrl);
    }

    const rawEvent = await store.findEventById(id);

    if (!rawEvent) {
      return sendProblem(res, 'not-found', 'Event Not Found', 404,
        `Event with ID '${id}' was not found`, req.originalUrl);
    }

    const representation = representEvent(rawEvent);
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(representation);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
