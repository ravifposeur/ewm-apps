// clients/common/pkce.js
const crypto = require('crypto');

/**
 * Generates PKCE code_verifier and code_challenge (RFC 7636 S256).
 */
function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier(length = 64) {
  const randomBytes = crypto.randomBytes(length);
  return base64UrlEncode(randomBytes);
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

function generatePKCE() {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCE,
  base64UrlEncode,
};
