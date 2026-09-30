// clients/common/scopes.js

const SCOPES = {
  EVENTS_READ: 'events:read',
  EVENTS_WRITE: 'events:write',
  SITES_APPROVE: 'sites:approve',
  CONFIRMATIONS_WRITE: 'confirmations:write',
  COLLECTIONS_WRITE: 'collections:write',
  ROSTERS_READ: 'rosters:read',
  ROSTERS_WRITE: 'rosters:write',
};

function hasRequiredScope(userScopes, requiredScope) {
  if (!requiredScope) return true;
  if (!Array.isArray(userScopes)) return false;
  return userScopes.includes(requiredScope);
}

function hasAllScopes(userScopes, requiredScopes = []) {
  if (!Array.isArray(requiredScopes) || requiredScopes.length === 0) return true;
  if (!Array.isArray(userScopes)) return false;
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

module.exports = {
  SCOPES,
  hasRequiredScope,
  hasAllScopes,
};
