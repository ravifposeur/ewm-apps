# Contract Changelog

## 0.1.0 - 3 SEPTEMBER 2026
- Initial contract definition for EWM-Apps Core API.
- Defines `/events`, `/sites`, `/rosters`, `/daily-collections`.
- Implements Idempotency-Key header on unsafe operations.
- Added `extensions` field to support plugin ecosystem.

## 0.1.1 - 10 SEPTEMBER 2026
- Changing name from Eventwise to EWM-Apps

## 0.2.0 - 30 SEPTEMBER 2026
### Added
- OAuth2 security scheme with 7 scopes (events:read, events:write, sites:approve, rosters:read, rosters:write, collections:write, confirmations:write).
- Default `security` at root (oauth2 with `events:read`).
- Per-operation `security` override with the required scope.
- `401 Unauthorized` and `403 Forbidden` responses on all protected operations.
- `WWW-Authenticate: Bearer` header on 401 responses.
- Extended `404` description to cover both "not found" and "not owned by caller", with identical responses to prevent ID enumeration.

### Breaking Changes
- **All operations under `/v1/**` and `/events/**` now require an OAuth2 access token.**
- `/health` remains public (`security: []`).
- Legacy clients without a token will receive `401` instead of data.
- Version bumped: `0.1.0` → `0.2.0` (minor bump per compatibility policy: adding a security requirement is a breaking change).

### Notes
- The rule "identical `404` for missing vs not-owned" is enforced at Layer 3 (object check) by the Client Owner.
