// tests/helpers/axios.js
// Shared axios factory that injects Authorization: Bearer <token>
// Uses tokens from tests/helpers/tokens.js (local test key, RS256).
// Token is cached per-process; safe for --runInBand.

const axios = require('axios');
const { tokenFor } = require('./tokens.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Cache: subject + scopes → token
const tokenCache = new Map();

async function getTokenFor(subject, scopes) {
  const key = `${subject}::${scopes.sort().join(',')}`;
  if (tokenCache.has(key)) return tokenCache.get(key);
  const token = await tokenFor(subject, scopes);
  tokenCache.set(key, token);
  return token;
}

// Default: all P4 scopes so contract tests can hit any endpoint
const ALL_SCOPES = [
  'events:read',
  'events:write',
  'sites:approve',
  'rosters:read',
  'rosters:write',
  'collections:write',
  'confirmations:write',
];

/**
 * Create an axios client with Bearer token auto-injected.
 *
 * @param {object} [opts]
 * @param {string} [opts.subject='organizer-a'] - JWT `sub`
 * @param {string[]} [opts.scopes=ALL_SCOPES]
 * @param {boolean} [opts.skipAuth=false] - if true, no Authorization header
 * @returns {import('axios').AxiosInstance}
 */
function createAuthedClient(opts = {}) {
  const {
    subject = 'organizer-a',
    scopes = ALL_SCOPES,
    skipAuth = false,
  } = opts;

  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true,
  });

  if (!skipAuth) {
    client.interceptors.request.use(async (config) => {
      const token = await getTokenFor(subject, scopes);
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  return client;
}

module.exports = { createAuthedClient, getTokenFor, BASE_URL, ALL_SCOPES };
