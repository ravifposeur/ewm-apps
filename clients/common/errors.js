// clients/common/errors.js

/**
 * Typed client errors matching RFC 7807 / RFC 9457 Problem Details.
 */
class ClientError extends Error {
  constructor(message, status = 500, problemDetails = {}, url = '') {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.problemDetails = problemDetails;
    this.title = problemDetails.title || message;
    this.detail = problemDetails.detail || message;
    this.type = problemDetails.type || '/problems/unknown-error';
    this.url = url;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class AuthenticationRequiredError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Authentication required (401)', 401, problemDetails, url);
  }
}

class ForbiddenError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Access forbidden: insufficient scope (403)', 403, problemDetails, url);
  }
}

class NotFoundError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Resource not found or unavailable (404)', 404, problemDetails, url);
  }
}

class ConflictError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Conflict: operation conflict (409)', 409, problemDetails, url);
  }
}

class PreconditionFailedError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Precondition Failed: entity modified (412)', 412, problemDetails, url);
  }
}

class ValidationError extends ClientError {
  constructor(problemDetails = {}, url = '') {
    super(problemDetails.detail || 'Validation failed (400)', 400, problemDetails, url);
    this.invalidFields = problemDetails.invalidFields || [];
  }
}

function createClientErrorFromResponse(status, problemDetails = {}, url = '') {
  switch (status) {
    case 400:
      return new ValidationError(problemDetails, url);
    case 401:
      return new AuthenticationRequiredError(problemDetails, url);
    case 403:
      return new ForbiddenError(problemDetails, url);
    case 404:
      return new NotFoundError(problemDetails, url);
    case 409:
      return new ConflictError(problemDetails, url);
    case 412:
      return new PreconditionFailedError(problemDetails, url);
    default:
      return new ClientError(problemDetails.detail || `HTTP Error ${status}`, status, problemDetails, url);
  }
}

module.exports = {
  ClientError,
  AuthenticationRequiredError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  PreconditionFailedError,
  ValidationError,
  createClientErrorFromResponse,
};
