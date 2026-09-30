// clients/device/auth.js
const { InMemoryTokenStore } = require('../common/tokenStore');
const { ApiClient } = require('../common/apiClient');
const { resolveConfig } = require('../common/config');

class DeviceClient {
  constructor(options = {}) {
    const config = resolveConfig(options);
    this.tokenStore = options.tokenStore || new InMemoryTokenStore();
    this.apiClient = new ApiClient({
      baseUrl: config.apiBaseUrl,
      tokenStore: this.tokenStore,
      fetchImplementation: options.fetchImplementation,
    });
    this.clientId = config.clients.deviceCrew.clientId;
    this.scopes = config.clients.deviceCrew.scopes;
  }
}

module.exports = {
  DeviceClient,
};
