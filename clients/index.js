// clients/index.js

const scopes = require('./common/scopes');
const pkce = require('./common/pkce');
const errors = require('./common/errors');
const tokenStore = require('./common/tokenStore');
const config = require('./common/config');
const { ApiClient } = require('./common/apiClient');
const { createWebAuthClient } = require('./web/auth');
const { createDeviceAuthClient } = require('./device/auth');
const { createMcpAuthClient } = require('./mcp/auth');

module.exports = {
  ...scopes,
  ...pkce,
  ...errors,
  ...tokenStore,
  ...config,
  ApiClient,
  createWebAuthClient,
  createDeviceAuthClient,
  createMcpAuthClient,
};
