// clients/common/tokenStore.js

/**
 * In-Memory Token Store (ADR 0003: Volatile Memory Only).
 * Access tokens are NEVER stored in localStorage, sessionStorage, or window._token.
 */
class InMemoryTokenStore {
  constructor() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
    this._claims = null;
  }

  setTokens({ accessToken, expiresIn = 300, scopes = [] } = {}) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Invalid access token: must be a non-empty string.');
    }
    this._accessToken = accessToken;
    this._expiresAt = Date.now() + (expiresIn || 300) * 1000;
    this._scopes = Array.isArray(scopes) ? scopes : [];
    this._claims = this._parseJwtPayload(accessToken);
  }

  getAccessToken() {
    if (!this._accessToken) return null;
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    return this._accessToken;
  }

  getClaims() {
    return this._claims;
  }

  getScopes() {
    return this._scopes;
  }

  hasScope(requiredScope) {
    if (!requiredScope) return true;
    return this._scopes.includes(requiredScope);
  }

  isAuthenticated() {
    return !this.isExpired() && this._accessToken !== null;
  }

  isExpired() {
    if (!this._expiresAt) return true;
    return Date.now() >= this._expiresAt - 10000; // 10s leeway
  }

  clear() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
    this._claims = null;
  }

  _parseJwtPayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = payload.length % 4;
      if (pad) {
        payload += '='.repeat(4 - pad);
      }
      if (typeof Buffer !== 'undefined') {
        return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      }
      return JSON.parse(atob(payload));
    } catch (_) {
      return null;
    }
  }
}

module.exports = {
  InMemoryTokenStore,
};
