// tests/helpers/axios.js
// Ambil token dari JWKS server via /sign (BUKAN tokenFor),
// supaya keypair-nya sama dengan yang di-serve ke service.

const axios = require('axios');
const { tokenFromJwksServer } = require('./tokens.js');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const JWKS_URI = process.env.OIDC_JWKS_URI;

if (!JWKS_URI) {
  throw new Error(
    'OIDC_JWKS_URI belum di-set. Set di env atau package.json script sebelum test.'
  );
}

const ALL_SCOPES = [
  'events:read',
  'events:write',
  'sites:approve',
  'rosters:read',
  'rosters:write',
  'collections:write',
  'confirmations:write',
];

const tokenCache = new Map();

async function getTokenFor(subject, scopes) {
  const key = `${subject}::${[...scopes].sort().join(',')}`;
  if (tokenCache.has(key)) return tokenCache.get(key);
  const token = await tokenFromJwksServer(JWKS_URI, subject, scopes);
  tokenCache.set(key, token);
  return token;
}

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
