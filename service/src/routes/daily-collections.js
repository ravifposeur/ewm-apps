// service/src/routes/daily-collections.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { sendProblem } = require('../problem');
const { dailyCollectionSchema } = require('../schemas/collections');
const store = require('../store');

const { requireScope } = require('../auth/require-scope');
const ownership = require('../auth/ownership');

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post('/', requireScope('collections:write'), async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key header is required', req.originalUrl);
    }
    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key must be a valid UUID v4', req.originalUrl);
    }

    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    const existing = await store.findIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.body_hash === bodyHash) return res.status(202).json(existing.response);
      return sendProblem(res, 'idempotency-key-reuse', 'Conflict', 409,
        'Idempotency-Key reused with different body', req.originalUrl,
        { expectedHash: existing.body_hash });
    }

    const { error, value } = dailyCollectionSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Bad Request', 400, error.message, req.originalUrl,
        { invalidFields: error.details });
    }

    const roster = await store.findRosterById(value.rosterId);
    if (!roster || !ownership.mayWriteCollection(req.principal, roster)) {
      return sendProblem(res, 'not-found', 'Not Found', 404,
        `Resource '${value.rosterId}' was not found or is unavailable`, req.originalUrl);
    }

    await store.insertManyCollections(value.records, value.eventId, value.rosterId);

    const responseBody = { acceptedCount: value.records.length, status: 'recorded' };
    await store.insertIdempotencyKey(idempotencyKey, bodyHash, { status: 202, ...responseBody });

    return res.status(202).json(responseBody);
  } catch (err) { next(err); }
});

module.exports = router;
