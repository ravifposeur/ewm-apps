// clients/common/apiClient.js
const { createClientErrorFromResponse } = require('./errors');

/**
 * Client-Side API HTTP Abstraction.
 * Injects Authorization: Bearer <access_token> header and centralizes 401/403/404 response handling.
 */
class ApiClient {
  /**
   * @param {object} options
   * @param {string} [options.baseUrl='http://localhost:3000/v1']
   * @param {object|function} [options.tokenStore] - Token store instance or getAccessToken() function
   * @param {typeof fetch} [options.fetchImplementation=globalThis.fetch]
   */
  constructor({ baseUrl = 'http://localhost:3000/v1', tokenStore = null, fetchImplementation = null } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenStore = tokenStore;
    this.fetch = fetchImplementation || globalThis.fetch;

    if (!this.fetch) {
      // Node.js fallback or requirement note
      throw new Error('ApiClient requires a fetch implementation (Node.js 18+ or web browser fetch).');
    }
  }

  /**
   * Resolves the access token from the configured token store.
   * @returns {Promise<string|null>}
   */
  async resolveAccessToken() {
    if (!this.tokenStore) return null;
    if (typeof this.tokenStore === 'function') {
      return this.tokenStore();
    }
    if (typeof this.tokenStore.getAccessToken === 'function') {
      return this.tokenStore.getAccessToken();
    }
    return null;
  }

  /**
   * Executes an HTTP request with automatic Bearer token injection and error handling.
   * @param {string} endpoint - Path relative to baseUrl (e.g. '/events')
   * @param {object} [options={}] - Fetch options
   * @returns {Promise<any>} Response JSON payload
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    // Inject Authorization Bearer header if token is available
    const token = await this.resolveAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    let response;
    try {
      response = await this.fetch(url, config);
    } catch (networkErr) {
      throw new Error(`Network request failed: ${networkErr.message}`);
    }

    // Handle non-2xx response statuses using typed client errors
    if (!response.ok) {
      let problemBody = {};
      try {
        problemBody = await response.json();
      } catch (_) {
        // Response body might be non-JSON
      }

      // Throws AuthenticationRequiredError (401), ForbiddenError (403), NotFoundError (404), etc.
      throw createClientErrorFromResponse(response.status, problemBody, url);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async get(endpoint, headers = {}) {
    return this.request(endpoint, { method: 'GET', headers });
  }

  async post(endpoint, body = null, headers = {}) {
    return this.request(endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  }
}

module.exports = {
  ApiClient,
};
