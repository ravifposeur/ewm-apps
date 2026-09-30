// clients/common/config.js

/**
 * Public Client Configurations for Web Admin, Web EO, and Device Crew.
 * Per ADR 0003: Public clients use OAuth2 Authorization Code + PKCE and MUST NOT contain client secrets.
 */
const PUBLIC_CLIENT_CONFIGS = Object.freeze({
  WEB_ADMIN: Object.freeze({
    clientId: process.env.CLIENT_ID_WEB_ADMIN || 'web-admin',
    oidcIssuer: process.env.OIDC_ISSUER || 'http://localhost:8080/realms/eventwise',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/v1',
    redirectUri: process.env.REDIRECT_URI_WEB_ADMIN || 'http://localhost:3000/admin/callback',
  }),
  WEB_EO: Object.freeze({
    clientId: process.env.CLIENT_ID_WEB_EO || 'web-eo',
    oidcIssuer: process.env.OIDC_ISSUER || 'http://localhost:8080/realms/eventwise',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/v1',
    redirectUri: process.env.REDIRECT_URI_WEB_EO || 'http://localhost:3000/eo/callback',
  }),
  DEVICE_CREW: Object.freeze({
    clientId: process.env.CLIENT_ID_DEVICE_CREW || 'device-crew',
    oidcIssuer: process.env.OIDC_ISSUER || 'http://localhost:8080/realms/eventwise',
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000/v1',
    redirectUri: process.env.REDIRECT_URI_DEVICE_CREW || 'eventwise://crew/callback',
  }),
});

/**
 * Validates that a public client configuration object does NOT contain any secret keys.
 * @param {object} config 
 */
function assertNoPublicClientSecret(config) {
  if (config && (config.clientSecret || config.client_secret || config.secret)) {
    throw new Error('SECURITY VIOLATION: Public clients MUST NOT contain client secrets!');
  }
}

module.exports = {
  PUBLIC_CLIENT_CONFIGS,
  assertNoPublicClientSecret,
};
