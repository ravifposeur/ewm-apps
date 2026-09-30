// service/src/app.js
require('dotenv').config();
const express = require('express');

// Config validation — will throw if OIDC_* env vars are missing.
// Import for side-effect: config.js MUST run its checks at startup.
const { config } = require('./config');

const { logger } = require('./logger');
const { authenticate } = require('./auth/authenticate');
const { errorHandler, sendProblem } = require('./problem');

const app = express();

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));

// Attach structured logger to every request
app.use((req, res, next) => {
  req.log = logger;
  next();
});

// ---------------------------------------------------------------------------
// Public routes — NO authentication
// ---------------------------------------------------------------------------
const healthRoute = require('./routes/health');
app.use('/health', healthRoute);

// ---------------------------------------------------------------------------
// Protected routes — authenticate applies per-group
// ---------------------------------------------------------------------------
const eventsRoute = require('./routes/events');
const dailyCollectionsRoute = require('./routes/daily-collections');

app.use('/v1/events', authenticate, eventsRoute);
app.use('/events', authenticate, eventsRoute);

app.use('/v1/daily-collections', authenticate, dailyCollectionsRoute);
app.use('/daily-collections', authenticate, dailyCollectionsRoute);

// ---------------------------------------------------------------------------
// 404 fallback — any unmatched route
// ---------------------------------------------------------------------------
app.use((req, res) => {
  return sendProblem(
    res,
    'not-found',
    'Not Found',
    404,
    `Route ${req.method} ${req.originalUrl} does not exist`,
    req.originalUrl
  );
});

// ---------------------------------------------------------------------------
// Global error handler — MUST be last
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Service running on port ${PORT}`);
  });
}

module.exports = app;
