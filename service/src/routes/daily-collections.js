// service/src/routes/daily-collections.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { sendProblem } = require('../problem');
const { dailyCollectionSchema } = require('../schemas/collections');

let store = null;
let collectionStore = null;
try { store = require('../store/idempotency'); } catch (e) { store = null; }
try { collectionStore = require('../store/collections'); } catch (e) { collectionStore = null; }

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// POST /daily-collections
router.post('/', async (req, res) => {
  try {
    // 1. Cek Idempotency-Key header
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey) {
      return sendProblem(res, 'missing-idempotency-key',
        'Idempotency-Key header is required', 400, null, req.path);
    }
    if (!UUID_V4_REGEX.test(idempotencyKey)) {
      return sendProblem(res, 'missing-idempotency-key',
        'Idempotency-Key must be a valid UUID v4', 400, null, req.path);
    }

    // 2. Cek key reuse
    const bodyHash = crypto.createHash('sha256')
      .update(JSON.stringify(req.body)).digest('hex');

    if (store && store.findIdempotencyKey) {
      const existing = await store.findIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.body_hash === bodyHash) {
          return res.status(202).json(existing.response);
        } else {
          return sendProblem(res, 'idempotency-key-reuse',
            'Idempotency-Key reused with different body', 409,
            null, req.path, { expectedHash: existing.body_hash });
        }
      }
    }

    // 3. Validasi body
    const { error, value } = dailyCollectionSchema.validate(req.body, { allowUnknown: true });
    if (error) {
      return sendProblem(res, 'invalid-request', 'Validation failed',
        400, error.message, req.path, { invalidFields: error.details });
    }

    // 4. Simpan records (kalau store collections ada)
    if (collectionStore && collectionStore.insertMany) {
      await collectionStore.insertMany(value.records, value.eventId, value.rosterId);
    }

    // 5. Simpan idempotency key
    const responseBody = { acceptedCount: value.records.length, status: 'recorded' };
    if (store && store.insertIdempotencyKey) {
      await store.insertIdempotencyKey(idempotencyKey, bodyHash, { status: 202, ...responseBody });
    }

    res.status(202).json(responseBody);
  } catch (err) {
    console.error('Error in POST /daily-collections:', err);
    sendProblem(res, 'internal-server-error', 'Something went wrong',
      500, null, req.path);
  }
});

module.exports = router;
