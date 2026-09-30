// service/src/representations/etag.js
const crypto = require('crypto');

/**
 * Generate ETag standar HTTP dengan tanda kutip ganda.
 * @param {any} data - Data yang akan di-hash
 * @returns {string} ETag format (e.g. '"a1b2c3d4e5f6g7h8"')
 */
function generateETag(data) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return `"${hash.substring(0, 16)}"`;
}

module.exports = { generateETag };
