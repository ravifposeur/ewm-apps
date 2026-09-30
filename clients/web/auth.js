// clients/web/auth.js
const { InMemoryTokenStore } = require('../common/tokenStore');
const { ApiClient } = require('../common/apiClient');
const { resolveConfig } = require('../common/config');

class WebClient {
  constructor(options = {}) {
    const config = resolveConfig(options);
    this.tokenStore = options.tokenStore || new InMemoryTokenStore();
    this.apiClient = new ApiClient({
      baseUrl: config.apiBaseUrl,
      tokenStore: this.tokenStore,
      fetchImplementation: options.fetchImplementation,
    });
    this.clientType = options.clientType || 'webAdmin';
    const clientConfig = config.clients[this.clientType] || config.clients.webAdmin;
    this.clientId = clientConfig.clientId;
    this.scopes = clientConfig.scopes;
  }
}

module.exports = {
  WebClient,
};
