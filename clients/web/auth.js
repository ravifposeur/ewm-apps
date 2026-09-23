// clients/web/auth.js
const { createPKCEPair } = require('../common/pkce');
const { InMemoryTokenStore } = require('../common/tokenStore');
const { ApiClient } = require('../common/apiClient');
const { SCOPES } = require('../common/scopes');
const { PUBLIC_CLIENT_CONFIGS, assertNoPublicClientSecret } = require('../common/config');

/**
 * Initializes authentication foundation for Web Public Clients (web-admin or web-eo).
 * Per ADR 0003: Public clients use OAuth2 Authorization Code + PKCE, access token in memory.
 * @param {'WEB_ADMIN'|'WEB_EO'} clientType 
 * @returns {{ tokenStore: InMemoryTokenStore, apiClient: ApiClient, createPKCE: Function, scopes: object }}
 */
function createWebAuthClient(clientType = 'WEB_ADMIN') {
  const config = PUBLIC_CLIENT_CONFIGS[clientType] || PUBLIC_CLIENT_CONFIGS.WEB_ADMIN;
  
  // Security Assertion: Ensure no secret is present in public client config
  assertNoPublicClientSecret(config);

  const tokenStore = new InMemoryTokenStore();
  const apiClient = new ApiClient({
    baseUrl: config.apiBaseUrl,
    tokenStore: tokenStore,
  });

  return {
    config,
    tokenStore,
    apiClient,
    createPKCE: () => createPKCEPair(),
    scopes: SCOPES,
  };
}

module.exports = {
  createWebAuthClient,
};
