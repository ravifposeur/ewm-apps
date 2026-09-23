// clients/common/pkce.js
const crypto = require('crypto');

/**
 * Encodes a buffer to Base64URL string according to RFC 7636.
 * @param {Buffer} buffer 
 * @returns {string}
 */
function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Generates a cryptographically secure random PKCE code verifier.
 * According to RFC 7636 Section 4.1, verifier must be between 43 and 128 characters.
 * @param {number} [byteLength=48] - Generates ~64 Base64URL characters
 * @returns {string} Base64URL-encoded code verifier
 */
function generateCodeVerifier(byteLength = 48) {
  if (byteLength < 32 || byteLength > 96) {
    throw new Error('PKCE byteLength must be between 32 and 96 to produce 43-128 characters.');
  }
  const randomBytes = crypto.randomBytes(byteLength);
  return toBase64Url(randomBytes);
}

/**
 * Calculates the PKCE S256 code challenge for a given code verifier.
 * According to RFC 7636 Section 4.2: code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
 * @param {string} codeVerifier 
 * @returns {string} Base64URL-encoded code challenge
 */
function generateCodeChallenge(codeVerifier) {
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    throw new Error('Invalid codeVerifier provided.');
  }
  const hash = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest();
  return toBase64Url(hash);
}

/**
 * Creates a complete PKCE pair with S256 method.
 * @param {number} [byteLength=48] 
 * @returns {{ codeVerifier: string, codeChallenge: string, codeChallengeMethod: string }}
 */
function createPKCEPair(byteLength = 48) {
  const codeVerifier = generateCodeVerifier(byteLength);
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
  createPKCEPair,
};
