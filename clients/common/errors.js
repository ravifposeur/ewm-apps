// clients/common/errors.js

/**
 * Base Client Error class
 */
class ClientError extends Error {
  constructor(message, status, typeUri = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.typeUri = typeUri;
    this.details = details;
  }
}

/**
 * HTTP 401 Unauthorized Error
 * Triggered when authentication token is missing, invalid, expired, or rejected.
 */
class AuthenticationRequiredError extends ClientError {
  constructor(message = 'Authentication required or token invalid', typeUri = '/problems/unauthorized', details = null) {
    super(message, 401, typeUri, details);
  }
}

/**
 * HTTP 403 Forbidden Error
 * Triggered when caller is authenticated but lacks required scope or permission.
 */
class ForbiddenError extends ClientError {
  constructor(message = 'Insufficient permissions or scope', typeUri = '/problems/forbidden', details = null) {
    super(message, 403, typeUri, details);
  }
}

/**
 * HTTP 404 Not Found Error
 * P4 Uniformity Rule: Triggered both when a resource does NOT exist AND when the caller does NOT own the resource.
 * Klien DILARANG membedakan keberadaan fisik entitas vs kepemilikan.
 */
class NotFoundError extends ClientError {
  constructor(message = 'Requested resource was not found or is unavailable', typeUri = '/problems/not-found', details = null) {
    super(message, 404, typeUri, details);
  }
}

/**
 * Parses HTTP status code and RFC 9457 Problem Details object to throw the appropriate ClientError.
 * @param {number} status 
 * @param {object} [problemBody] 
 * @param {string} [requestUrl] 
 * @returns {ClientError}
 */
function createClientErrorFromResponse(status, problemBody = {}, requestUrl = null) {
  const typeUri = problemBody.type || null;
  const title = problemBody.title || 'API Error';
  const detail = problemBody.detail || `Request to ${requestUrl || 'API'} failed with status ${status}`;

  switch (status) {
    case 401:
      return new AuthenticationRequiredError(detail, typeUri, problemBody);
    case 403:
      return new ForbiddenError(detail, typeUri, problemBody);
    case 404:
      // Uniform 404 handling: Always map to NotFoundError without analyzing ownership details
      return new NotFoundError('Resource not found or unavailable', typeUri, problemBody);
    default:
      return new ClientError(detail, status, typeUri, problemBody);
  }
}

module.exports = {
  ClientError,
  AuthenticationRequiredError,
  ForbiddenError,
  NotFoundError,
  createClientErrorFromResponse,
};
