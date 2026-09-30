// clients/device/auth.js
const { createPKCEPair } = require('../common/pkce');
const { EncryptedDeviceTokenStore } = require('../common/tokenStore');
const { ApiClient } = require('../common/apiClient');
const { SCOPES } = require('../common/scopes');
const { PUBLIC_CLIENT_CONFIGS, assertNoPublicClientSecret } = require('../common/config');

/**
 * Initializes authentication foundation for Device Petugas Public Client (device-crew).
 * Per ADR 0003: Device client uses PKCE and encrypted native storage (EncryptedSharedPreferences/Keychain).
 * @param {object} [storageAdapter] - Optional native storage adapter
 * @returns {{ tokenStore: EncryptedDeviceTokenStore, apiClient: ApiClient, createPKCE: Function, scopes: object }}
 */
function createDeviceAuthClient(storageAdapter = null) {
  const config = PUBLIC_CLIENT_CONFIGS.DEVICE_CREW;

  // Security Assertion: Ensure no secret is present in public client config
  assertNoPublicClientSecret(config);

  const tokenStore = new EncryptedDeviceTokenStore(storageAdapter);
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
  createDeviceAuthClient,
};
