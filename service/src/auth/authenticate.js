const { verifyAccessToken } = require('./verify');
const { principalFrom } = require('./principal');
const { unauthorized } = require('../problem');

async function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  
  if (!header.startsWith('Bearer ')) {
    req.principal = null;
    return next();
  }

  try {
    const rawToken = header.slice(7); // Membuang prefix 'Bearer '
    const claims = await verifyAccessToken(rawToken);
    
    req.principal = principalFrom(claims);
    return next();
  } catch (err) {
    if (req.log && typeof req.log.warn === 'function') {
        req.log.warn({ reason: err.code ?? err.name }, 'Token rejected');
    } else {
        console.warn(`Token rejected: ${err.code ?? err.name}`);
    }
    
    return unauthorized(res, 'invalid_token');
  }
}

module.exports = { authenticate };
