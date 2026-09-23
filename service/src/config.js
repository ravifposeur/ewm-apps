require('dotenv').config();

const required = ['PORT', 'DATABASE_URL', 'OIDC_ISSUER', 'OIDC_JWKS_URI', 'OIDC_AUDIENCE'];
const missing = required.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error(`FATAL ERROR: required configuration missing: ${missing.join(', ')}`);
  process.exit(1); 
}

const config = {
  port: process.env.PORT,
  databaseUrl: process.env.DATABASE_URL,
  oidcIssuer: process.env.OIDC_ISSUER,
  oidcJwksUri: process.env.OIDC_JWKS_URI,
  oidcAudience: process.env.OIDC_AUDIENCE,
};

module.exports = { config };
