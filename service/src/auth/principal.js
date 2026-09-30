// service/src/auth/principal.js

/**
 * Build a principal object from raw JWT claims.
 * This is the ONLY place that translates provider-specific claim names
 * into the canonical `principal` shape used by Layer 2 and Layer 3.
 *
 * Canonical principal shape:
 *   {
 *     subject: string,       // stable user/SA identifier → used as owner key
 *     kind: 'user' | 'service',
 *     scopes: string[],      // normalized scope list
 *     tokenId: string|null,  // JWT ID for audit
 *     issuedAt: number|null,
 *     expiresAt: number|null,
 *   }
 */
function parseScope(claims) {
  // Keycloak default: `scope` is a space-separated string.
  // Some mappers emit `scp` as an array. Support both.
  const raw = claims.scope ?? claims.scp ?? '';
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'string') return raw.split(' ').filter(Boolean);
  return [];
}

/**
 * Heuristic: a token is a service-account token if:
 *  - `sub` starts with `service-account-` (Keycloak convention), OR
 *  - `gty === 'client-credentials'` (Keycloak claim), OR
 *  - `azp === sub` (some providers use this)
 * If in doubt, default to 'user' — safer for ownership checks.
 */
function detectKind(claims) {
  if (typeof claims.sub === 'string' && claims.sub.startsWith('service-account-')) {
    return 'service';
  }
  if (claims.gty === 'client-credentials') {
    return 'service';
  }
  return 'user';
}

function principalFrom(claims) {
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
    throw new Error('Invalid JWT claims: missing sub');
  }

  return {
    subject: claims.sub,
    kind: detectKind(claims),
    scopes: parseScope(claims),
    tokenId: claims.jti ?? null,
    issuedAt: typeof claims.iat === 'number' ? claims.iat : null,
    expiresAt: typeof claims.exp === 'number' ? claims.exp : null,
  };
}

module.exports = { principalFrom, parseScope, detectKind };
