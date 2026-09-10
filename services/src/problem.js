// src/problem.js
// RFC 9457 Problem Details generator

/**
 * Membuat objek Problem Details sesuai RFC 9457.
 * @param {string} type - Kategori error (akan menjadi path /errors/{type})
 * @param {string} title - Judul singkat error
 * @param {number} status - HTTP status code
 * @param {string} [detail] - Penjelasan spesifik error
 * @param {string} [instance] - URI endpoint yang dipanggil
 * @param {object} [extensions] - Field tambahan (deviationPercentage, dll)
 * @returns {object} Problem Details object
 */
function createProblem(type, title, status, detail, instance, extensions = {}) {
  // Gunakan relative path sebagai type (sesuai rekomendasi)
  const problem = {
    type: `/errors/${type}`,
    title: title,
    status: status,
    ...(detail && { detail }),
    ...(instance && { instance }),
    ...extensions,
  };

  // Hapus field yang nilainya null/undefined agar response bersih
  Object.keys(problem).forEach((key) => {
    if (problem[key] === null || problem[key] === undefined) {
      delete problem[key];
    }
  });

  return problem;
}

/**
 * Middleware untuk menangani error global (catch-all)
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Express next
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  // Default internal server error
  const status = err.status || 500;
  const type = err.type || 'internal-error';
  const title = err.title || 'Internal Server Error';
  const detail = err.detail || err.message || 'An unexpected error occurred.';
  const instance = err.instance || req.originalUrl;

  const problem = createProblem(type, title, status, detail, instance, err.extensions || {});

  // Log error ke console (nanti diganti dengan logger di sesi 9)
  console.error(`[${status}] ${title}:`, err);

  res.status(status).json(problem);
}

module.exports = {
  createProblem,
  errorHandler,
};
