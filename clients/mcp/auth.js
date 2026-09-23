// clients/mcp/auth.js
const { ApiClient } = require('../common/apiClient');
const { SCOPES } = require('../common/scopes');

/**
 * Initializes authentication foundation for MCP Agent (Confidential Client / Server M2M).
 * Per ADR 0003: Confidential clients store secrets ONLY in server environment variables / secret manager.
 * @param {object} [options]
 * @param {string} [options.apiBaseUrl]
 * @param {function} [options.getAccessToken]
 * @returns {{ apiClient: ApiClient, scopes: object }}
 */
function createMcpAuthClient({ apiBaseUrl = null, getAccessToken = null } = {}) {
  const baseUrl = apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3000/v1';

  const apiClient = new ApiClient({
    baseUrl,
    tokenStore: getAccessToken,
  });

  return {
    apiClient,
    scopes: SCOPES,
  };
}

module.exports = {
  createMcpAuthClient,
};
