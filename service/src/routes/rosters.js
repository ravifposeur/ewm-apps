// service/src/routes/rosters.js
const express = require('express');
const router = express.Router();
const { sendProblem } = require('../problem');
const { requireScope } = require('../auth/require-scope');
const ownership = require('../auth/ownership');
const store = require('../store');
const { generateETag } = require('../representations/etag');

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function notFound(res, req, id) {
  return sendProblem(res, 'not-found', 'Not Found', 404,
    `Resource '${id}' was not found or is unavailable`, req.originalUrl);
}

router.get('/', requireScope('rosters:read'), async (req, res, next) => {
  try {
    const { eventId } = req.query;
    if (!eventId || !VALID_ID_REGEX.test(eventId)) {
      return sendProblem(res, 'invalid-query', 'Bad Request', 400, 'Query param eventId is required and must be valid', req.originalUrl);
    }

    // Layer 3 Check berdasarkan eventId di query
    const event = await store.findEventById(eventId);
    if (!event || !ownership.mayReadEvent(req.principal, event)) {
      return notFound(res, req, eventId);
    }

    const rosters = await store.findRostersByEventId(eventId);
    
    // ETag check
    const etag = generateETag(rosters || []);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    return res.status(200).json(rosters || []);
  } catch (err) { next(err); }
});

router.post('/', requireScope('rosters:write'), async (req, res, next) => {
  try {
    // Asumsi req.body memiliki eventId
    const { eventId } = req.body;
    if (!eventId || !VALID_ID_REGEX.test(eventId)) {
      return sendProblem(res, 'invalid-body', 'Bad Request', 400, 'Body must contain valid eventId', req.originalUrl);
    }

    // Layer 3 Check
    const event = await store.findEventById(eventId);
    if (!event || !ownership.mayWriteEvent(req.principal, event)) {
      return notFound(res, req, eventId);
    }

    // Insert roster
    const newRoster = await store.insertRoster(req.body);
    return res.status(201).location(`/v1/rosters/${newRoster.id}`).json(newRoster);
  } catch (err) { next(err); }
});

module.exports = router;
