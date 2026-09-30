const { createClientErrorFromResponse } = require('./errors');

/**
 * In-Memory ETag & Data Cache for HTTP conditional requests (RFC 7232).
 */
class InMemoryEtagCache {
  constructor() {
    this._entries = new Map();
  }

  _parseArgs(methodOrUrl, urlOrData) {
    if (urlOrData === undefined || typeof urlOrData !== 'string') {
      return { method: 'GET', url: methodOrUrl };
    }
    return { method: methodOrUrl.toUpperCase(), url: urlOrData };
  }

  _makeKey(method, url) {
    return `${(method || 'GET').toUpperCase()}:${url}`;
  }

  get(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.get(key) || null;
  }

  has(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.has(key);
  }

  set(methodOrUrl, urlOrData, payloadOrEtag) {
    let method = 'GET';
    let url = methodOrUrl;
    let etag = null;
    let data = null;

    if (typeof urlOrData === 'string') {
      method = methodOrUrl.toUpperCase();
      url = urlOrData;
      if (payloadOrEtag && typeof payloadOrEtag === 'object' && ('etag' in payloadOrEtag || 'data' in payloadOrEtag)) {
        etag = payloadOrEtag.etag;
        data = payloadOrEtag.data;
      } else {
        data = payloadOrEtag;
      }
    } else {
      url = methodOrUrl;
      data = urlOrData;
      etag = payloadOrEtag;
    }

    const key = this._makeKey(method, url);
    this._entries.set(key, {
      etag,
      data,
      timestamp: Date.now(),
      isStale: false,
    });
  }

  markStale(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    const entry = this._entries.get(key);
    if (entry) {
      entry.isStale = true;
    }
  }

  delete(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
  }

  get size() {
    return this._entries.size;
  }
}

/**
 * Universal Client-Side API HTTP Abstraction.
 * Injects Authorization: Bearer <access_token> header, manages in-memory ETag cache (A.7),
 * and centralizes 401/403/404/412 response handling.
 */
class ApiClient {
  constructor({ baseUrl = 'http://localhost:3000/v1', tokenStore = null, fetchImplementation = null, cache = null } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenStore = tokenStore;
    this.fetch = fetchImplementation || globalThis.fetch;
    this.cache = cache || new InMemoryEtagCache();

    if (!this.fetch) {
      throw new Error('ApiClient requires a fetch implementation (Node.js 18+ or browser fetch).');
    }
  }

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

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, application/problem+json',
      ...(options.headers || {}),
    };

    const token = await this.resolveAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      method,
      headers,
    };

    let response;
    try {
      response = await this.fetch(url, config);
    } catch (networkErr) {
      throw new Error(`Network request failed: ${networkErr.message}`);
    }

    // A.7 Handle 304 Not Modified
    if (response.status === 304) {
      const cached = this.cache ? this.cache.get(method, url) : null;
      if (cached && cached.data) {
        cached.isStale = false;
        let result = cached.data;
        if (Array.isArray(result)) {
          result = [...result];
        } else if (result && typeof result === 'object') {
          result = { ...result };
        }
        if (result && typeof result === 'object') {
          result._meta = {
            status: 304,
            isCached: true,
            is304: true,
            isStale: false,
            etag: cached.etag,
          };
        }
        return result;
      }
      return { _meta: { status: 304, isCached: false, is304: true, isStale: false } };
    }

    if (!response.ok) {
      let problemBody = {};
      try {
        problemBody = await response.json();
      } catch (_) {
        // Non-JSON problem response
      }

      const errEtag = response.headers.get('etag') || response.headers.get('ETag');
      if (errEtag && !problemBody.currentEtag) {
        problemBody.currentEtag = errEtag;
      }

      throw createClientErrorFromResponse(response.status, problemBody, url);
    }

    if (response.status === 204) {
      return null;
    }

    const responseData = await response.json();
    const responseEtag = response.headers.get('etag') || response.headers.get('ETag');

    // A.7 Update Cache on successful 200 GET
    if (method === 'GET' && response.status === 200 && responseEtag && this.cache) {
      this.cache.set(method, url, { etag: responseEtag, data: responseData });
    }

    if (responseData && typeof responseData === 'object') {
      responseData._meta = {
        status: response.status,
        etag: responseEtag || null,
        isCached: false,
        is304: false,
        isStale: false,
      };
    }

    return responseData;
  }

  async get(endpoint, options = {}) {
    const customHeaders = options.headers || options;
    const isOptionsObj = typeof options === 'object' && options !== null && !Array.isArray(options) && 'headers' in options;
    const headers = isOptionsObj ? { ...(options.headers || {}) } : { ...customHeaders };
    const forceRefresh = isOptionsObj ? Boolean(options.forceRefresh) : false;

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const cached = (!forceRefresh && this.cache) ? this.cache.get('GET', url) : null;

    if (cached && cached.etag && !headers['If-None-Match']) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      return await this.request(endpoint, { method: 'GET', headers });
    } catch (err) {
      if (cached && cached.data) {
        if (this.cache) this.cache.markStale('GET', url);
        let result = cached.data;
        if (Array.isArray(result)) {
          result = [...result];
        } else if (result && typeof result === 'object') {
          result = { ...result };
        }
        if (result && typeof result === 'object') {
          result._meta = {
            isCached: true,
            isStale: true,
            etag: cached.etag,
            error: err,
          };
        }
        return result;
      }
      throw err;
    }
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
  InMemoryEtagCache,
};
