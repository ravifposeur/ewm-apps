// service/src/problem.js

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

function sendProblem(res, type, title, status, detail, instance, extensions = {}) {
  const problem = createProblem(
    type,
    title,
    status,
    detail,
    instance,
    extensions
  );

  res.setHeader('Content-Type', 'application/problem+json');
  res.status(status).json(problem);
}

function unauthorized(res, detail = 'invalid_token') {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer error="${detail}"`
  );

  return sendProblem(
    res,
    'unauthorized',
    'Unauthorized',
    401,
    detail
  );
}

function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  sendProblem(
    res,
    'internal-server-error',
    'An unexpected error occurred',
    500,
    process.env.NODE_ENV === 'development' ? err.message : undefined,
    req.path
  );
}

module.exports = {
  createProblem,
  sendProblem,
  unauthorized,
  errorHandler
};
