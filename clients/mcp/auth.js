// clients/mcp/auth.js
const { InMemoryTokenStore } = require('../common/tokenStore');
const { ApiClient } = require('../common/apiClient');
const { resolveConfig } = require('../common/config');

class McpClient {
  constructor(options = {}) {
    const config = resolveConfig(options);
    this.tokenStore = options.tokenStore || new InMemoryTokenStore();
    this.apiClient = new ApiClient({
      baseUrl: config.apiBaseUrl,
      tokenStore: this.tokenStore,
      fetchImplementation: options.fetchImplementation,
    });
    this.clientId = options.clientId || 'mcp-agent';
    this.scopes = options.scopes || ['events:read', 'events:write'];
  }
}

module.exports = {
  McpClient,
};
