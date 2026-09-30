// clients/common/config.js

/**
 * Standard client configuration resolving base API URLs and OAuth2 parameters.
 * Supports window.ENV?.VITE_API_BASE_URL in browser environments and process.env in Node.js.
 */
function resolveConfig(overrides = {}) {
  const isBrowser = typeof window !== 'undefined';
  
  const defaultApiBaseUrl = isBrowser
    ? (window.ENV?.VITE_API_BASE_URL || 'http://localhost:3000')
    : (process.env.API_BASE_URL || 'http://localhost:3000');

  const defaultOidcIssuer = isBrowser
    ? (window.ENV?.VITE_OIDC_ISSUER || 'http://localhost:8080/realms/eventwise')
    : (process.env.OIDC_ISSUER || 'http://localhost:8080/realms/eventwise');

  return {
    apiBaseUrl: overrides.apiBaseUrl || defaultApiBaseUrl,
    oidcIssuer: overrides.oidcIssuer || defaultOidcIssuer,
    clients: {
      webAdmin: {
        clientId: 'web-admin',
        name: 'Web Admin / Depot Operator',
        scopes: ['events:read', 'confirmations:write', 'rosters:read', 'rosters:write'],
      },
      webEo: {
        clientId: 'web-eo',
        name: 'Event Organizer (EO)',
        scopes: ['events:read', 'events:write', 'sites:approve'],
      },
      deviceCrew: {
        clientId: 'device-crew',
        name: 'Field Collection Crew',
        scopes: ['events:read', 'collections:write'],
      },
    },
    ...overrides,
  };
}

module.exports = {
  resolveConfig,
};
