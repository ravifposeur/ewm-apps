require('dotenv').config();
const express = require('express');

// Strict validation — WAJIB ada semua, tidak ada fallback
const requiredEnvs = ['PORT', 'DATABASE_URL'];
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(`FATAL ERROR: Environment variable ${env} is missing.`);
    process.exit(1);
  }
}

const app = express();
app.use(express.json());

const healthRoute = require('./routes/health');
const eventsRoute = require('./routes/events');
const dailyCollectionsRoute = require('./routes/daily-collections');
const { errorHandler } = require('./problem');

app.use('/health', healthRoute);
app.use('/v1/events', eventsRoute);
app.use('/events', eventsRoute);
app.use('/v1/daily-collections', dailyCollectionsRoute);
app.use('/daily-collections', dailyCollectionsRoute);

app.use(errorHandler);

// Root endpoint — service metadata
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'EWM-Apps Core API',
    version: '0.1.0',
    description: 'Event Waste Management Platform — Core Service',
    documentation: '/docs (coming soon)',
    health: '/health',
    spec: 'https://github.com/ravifposeur/ewm-apps/blob/main/openapi.yaml',
    endpoints: {
      events: '/v1/events',
      dailyCollections: '/v1/daily-collections',
      health: '/health',
    },
  });
});

const PORT = process.env.PORT;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Service running on port ${PORT}`);
  });
}

module.exports = app;
