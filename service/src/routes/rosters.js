// service/src/routes/rosters.js
const express = require('express');
const router = express.Router();
const { sendProblem } = require('../problem');
const { requireScope } = require('../auth/require-scope');

function notImplemented(res, req) {
  return sendProblem(res, 'not-implemented', 'Not Implemented', 501,
    `Endpoint ${req.method} ${req.originalUrl} is planned but not yet implemented`,
    req.originalUrl);
}

router.get('/', requireScope('rosters:read'), (req, res) => notImplemented(res, req));
router.post('/', requireScope('rosters:write'), (req, res) => notImplemented(res, req));

module.exports = router;
