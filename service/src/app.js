// service/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Tambahkan import cors
const { config } = require('./config');
const { logger } = require('./logger');
const { authenticate } = require('./auth/authenticate');
const { errorHandler, sendProblem } = require('./problem');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.log = logger; next(); });

// Konfigurasi CORS (Tugas 1)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',       // dev web app
  'http://localhost:3000',       // dev alternative
  'https://ewm-web.onrender.com' // production web app (ganti nanti jika diperlukan)
];

app.use(cors({
  origin: (origin, callback) => {
    // Izinkan requests tanpa origin (misal dari Postman, curl, backend lain)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'If-None-Match'],
  exposedHeaders: ['ETag', 'Location'],
  maxAge: 600, // cache preflight OPTIONS 10 menit
}));

// Public
const healthRoute = require('./routes/health');
app.use('/health', healthRoute);

// Protected
const eventsRoute = require('./routes/events');
const dailyCollectionsRoute = require('./routes/daily-collections');
const sitesRoute = require('./routes/sites');
const rostersRoute = require('./routes/rosters');

app.use('/v1/events', authenticate, eventsRoute);
app.use('/events', authenticate, eventsRoute);

app.use('/v1/daily-collections', authenticate, dailyCollectionsRoute);
app.use('/daily-collections', authenticate, dailyCollectionsRoute);

app.use('/v1/sites', authenticate, sitesRoute);
app.use('/sites', authenticate, sitesRoute);

app.use('/v1/rosters', authenticate, rostersRoute);
app.use('/rosters', authenticate, rostersRoute);

// 404 fallback
app.use((req, res) => sendProblem(res, 'not-found', 'Not Found', 404,
  `Route ${req.method} ${req.originalUrl} does not exist`, req.originalUrl));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Service running on port ${PORT}`));
}
module.exports = app;
