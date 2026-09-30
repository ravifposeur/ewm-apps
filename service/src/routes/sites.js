// service/src/routes/sites.js
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

router.get('/:siteId', requireScope('events:read'), async (req, res, next) => {
  try {
    const { siteId } = req.params;
    if (!VALID_ID_REGEX.test(siteId)) {
      return sendProblem(res, 'invalid-id', 'Bad Request', 400, `Malformed site ID: '${siteId}'`, req.originalUrl);
    }

    // Fetch site, biasanya join dengan event untuk cek layer 3
    const site = await store.findSiteById(siteId); 
    if (!site) return notFound(res, req, siteId);

    const event = await store.findEventById(site.event_id);
    if (!event || !ownership.mayReadEvent(req.principal, event)) {
      return notFound(res, req, siteId);
    }

    // ETag Check
    const etag = generateETag(site);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    return res.status(200).json(site);
  } catch(err) { next(err); }
});

module.exports = router;
