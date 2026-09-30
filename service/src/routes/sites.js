// service/src/routes/sites.js
const express = require('express');
const router = express.Router();
const { sendProblem } = require('../problem');
const { requireScope } = require('../auth/require-scope');

router.get('/:siteId', requireScope('events:read'), (req, res) => {
  return sendProblem(res, 'not-implemented', 'Not Implemented', 501,
    `Endpoint ${req.method} ${req.originalUrl} is planned but not yet implemented`,
    req.originalUrl);
});

module.exports = router;
