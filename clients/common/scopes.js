// clients/common/scopes.js

/**
 * Official P4 Scopes as defined in ADR 0003 (docs/decisions/0003-autentikasi.md).
 * DO NOT add custom or candidate scopes outside of this official vocabulary.
 */
const SCOPES = Object.freeze({
  EVENTS_READ: 'events:read',
  EVENTS_WRITE: 'events:write',
  SITES_APPROVE: 'sites:approve',
  ROSTERS_READ: 'rosters:read',
  ROSTERS_WRITE: 'rosters:write',
  COLLECTIONS_WRITE: 'collections:write',
  CONFIRMATIONS_WRITE: 'confirmations:write',
});

/**
 * Array of all valid scope strings.
 */
const VALID_SCOPES_LIST = Object.freeze(Object.values(SCOPES));

/**
 * Validates if a scope string is part of the official P4 ADR 0003 vocabulary.
 * @param {string} scope 
 * @returns {boolean}
 */
function isValidScope(scope) {
  return VALID_SCOPES_LIST.includes(scope);
}

module.exports = {
  SCOPES,
  VALID_SCOPES_LIST,
  isValidScope,
};
