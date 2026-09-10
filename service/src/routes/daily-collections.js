// service/src/routes/daily-collections.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { sendProblem } = require('../problem');
const { dailyCollectionSchema } = require('../schemas/collections');
const store = require('../store');

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.post('/', async (req, res, next) => {
  try {
    // 1. Cek Idempotency-Key
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key header is required', req.originalUrl);
    }
    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      return sendProblem(res, 'missing-idempotency-key', 'Bad Request', 400,
        'Idempotency-Key must be a valid UUID v4', req.originalUrl);
    }

    // 2. Cek key reuse
    const bodyHash = crypto.createHash('sha256')
      .update(JSON.stringify(req.body)).digest('hex');

    const existing = await store.findIdempotencyKey(idempotencyKey);
    if (existing) {
      if (existing.body_hash === bodyHash) {
        return res.status(202).json(existing.response);
      } else {
        return sendProblem(res, 'idempotency-key-reuse', 'Conflict', 409,
          'Idempotency-Key reused with different body',
          req.originalUrl,
          { expectedHash: existing.body_hash });
      }
    }

    // 3. Validasi body
    const { error, value } = dailyCollectionSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Bad Request', 400,
        error.message, req.originalUrl, { invalidFields: error.details });
    }

    // 4. Simpan records
    await store.insertManyCollections(value.records, value.eventId, value.rosterId);

    // 5. Simpan idempotency key
    const responseBody = { acceptedCount: value.records.length, status: 'recorded' };
    await store.insertIdempotencyKey(idempotencyKey, bodyHash, { status: 202, ...responseBody });

    return res.status(202).json(responseBody);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
