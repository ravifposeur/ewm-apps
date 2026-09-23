// clients/common/tokenStore.js

/**
 * In-Memory Token Store for Web Public Clients (web-admin, web-eo).
 * Per ADR 0003: Access tokens MUST be kept in memory only and MUST NOT be stored in localStorage.
 * Tokens are never logged to console or persistent plain text files.
 */
class InMemoryTokenStore {
  constructor() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
  }

  /**
   * Sets the access token in volatile memory.
   * @param {string} token 
   * @param {number} expiresInSeconds 
   * @param {Array<string>} [scopes=[]] 
   */
  setAccessToken(token, expiresInSeconds, scopes = []) {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid access token provided.');
    }
    this._accessToken = token;
    this._expiresAt = Date.now() + expiresInSeconds * 1000;
    this._scopes = Array.isArray(scopes) ? scopes : [];
  }

  /**
   * Retrieves the current access token if it exists and is not expired.
   * @returns {string|null}
   */
  getAccessToken() {
    if (!this._accessToken) return null;
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    return this._accessToken;
  }

  /**
   * Checks if the current stored token is expired (or within 10s margin).
   * @returns {boolean}
   */
  isExpired() {
    if (!this._expiresAt) return true;
    return Date.now() >= this._expiresAt - 10000;
  }

  /**
   * Clears the stored token from memory.
   */
  clear() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
  }
}

/**
 * Encrypted Token Store interface for Device Petugas Client (device-crew).
 * Per ADR 0003: Device client uses EncryptedSharedPreferences (Android) / Keychain (iOS).
 */
class EncryptedDeviceTokenStore {
  constructor(storageAdapter = null) {
    this.storageAdapter = storageAdapter;
    this._memoryFallback = new InMemoryTokenStore();
  }

  async setAccessToken(token, expiresInSeconds, scopes = []) {
    if (this.storageAdapter && typeof this.storageAdapter.setEncryptedItem === 'function') {
      await this.storageAdapter.setEncryptedItem('access_token', token);
      await this.storageAdapter.setEncryptedItem('expires_at', String(Date.now() + expiresInSeconds * 1000));
    } else {
      this._memoryFallback.setAccessToken(token, expiresInSeconds, scopes);
    }
  }

  async getAccessToken() {
    if (this.storageAdapter && typeof this.storageAdapter.getEncryptedItem === 'function') {
      const token = await this.storageAdapter.getEncryptedItem('access_token');
      const expiresAt = await this.storageAdapter.getEncryptedItem('expires_at');
      if (token && expiresAt && Date.now() < Number(expiresAt) - 10000) {
        return token;
      }
      return null;
    }
    return this._memoryFallback.getAccessToken();
  }

  async clear() {
    if (this.storageAdapter && typeof this.storageAdapter.removeEncryptedItem === 'function') {
      await this.storageAdapter.removeEncryptedItem('access_token');
      await this.storageAdapter.removeEncryptedItem('expires_at');
    } else {
      this._memoryFallback.clear();
    }
  }
}

module.exports = {
  InMemoryTokenStore,
  EncryptedDeviceTokenStore,
};
