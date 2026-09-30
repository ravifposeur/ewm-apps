const { ApiClient, InMemoryEtagCache } = require('./common/apiClient');
const { InMemoryTokenStore } = require('./common/tokenStore');
const { generatePKCE } = require('./common/pkce');
const { SCOPES, hasRequiredScope, hasAllScopes } = require('./common/scopes');
const { resolveConfig } = require('./common/config');
const errors = require('./common/errors');
const { DeviceClient } = require('./device/auth');
const { McpClient } = require('./mcp/auth');
const { WebClient } = require('./web/auth');

module.exports = {
  ApiClient,
  InMemoryEtagCache,
  InMemoryTokenStore,
  generatePKCE,
  SCOPES,
  hasRequiredScope,
  hasAllScopes,
  resolveConfig,
  ...errors,
  DeviceClient,
  McpClient,
  WebClient,
};
