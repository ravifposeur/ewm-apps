// service/src/problem.js

/**
 * Build a Problem Details object per RFC 9457.
 * @param {string} type - Short identifier; akan di-prefix dengan `/problems/`.
 * @param {string} title - Human-readable summary.
 * @param {number} status - HTTP status code.
 * @param {string} [detail] - Specific explanation for this occurrence.
 * @param {string} [instance] - URI reference for this occurrence.
 * @param {object} [extensions] - Additional fields (deviationPercentage, expectedHash, dll).
 */
function createProblem(type, title, status, detail, instance, extensions = {}) {
  const problem = {
    type: `/problems/${type}`,
    title,
    status,
  };

  if (detail) problem.detail = detail;
  if (instance) problem.instance = instance;
  Object.assign(problem, extensions);

  Object.keys(problem).forEach((key) => {
    if (problem[key] === undefined || problem[key] === null) {
      delete problem[key];
    }
  });

  return problem;
}

/**
 * Send a Problem Details response with the correct Content-Type.
 */
function sendProblem(res, type, title, status, detail, instance, extensions = {}) {
  const problem = createProblem(type, title, status, detail, instance, extensions);
  res.setHeader('Content-Type', 'application/problem+json');
  return res.status(status).json(problem);
}

/**
 * Layer 1 rejection: missing / invalid / expired access token.
 * MUST include WWW-Authenticate header per RFC 6750.
 *
 * @param {object} res - Express response object
 * @param {string} [detail] - Specific reason (default: 'invalid_token')
 * @param {string} [instance] - Request path (req.path / req.originalUrl)
 */
function unauthorized(res, detail, instance) {
  const errorCode = detail || 'invalid_token';
  res.setHeader(
    'WWW-Authenticate',
    `Bearer realm="api", error="${errorCode}"`
  );

  return sendProblem(
    res,
    'unauthorized',
    'Unauthorized',
    401,
    errorCode,
    instance
  );
}

/**
 * Layer 2 rejection: token valid, but scope is insufficient.
 * NO WWW-Authenticate header — token is valid, so no need to challenge.
 *
 * @param {object} res - Express response object
 * @param {string} [detail] - Specific reason (e.g., "missing scope: confirmations:write")
 * @param {string} [instance] - Request path
 */
function forbidden(res, detail, instance) {
  return sendProblem(
    res,
    'forbidden',
    'Forbidden',
    403,
    detail || 'Insufficient scope to access this resource',
    instance
  );
}

/**
 * Global error handler — last middleware. Catches any unhandled error.
 * Never leaks internal details in production.
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  sendProblem(
    res,
    'internal-server-error',
    'An unexpected error occurred',
    500,
    process.env.NODE_ENV === 'development' ? err.message : undefined,
    req.originalUrl || req.path
  );
}

module.exports = {
  createProblem,
  sendProblem,
  unauthorized,
  forbidden,
  errorHandler,
};
