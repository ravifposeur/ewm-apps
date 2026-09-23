const express = require('express');
const { config } = require('./config'); // Pastikan mengecek env variables di sini
const { logger } = require('./logger');
const { authenticate } = require('./auth/authenticate');

const app = express();

app.use(express.json());

app.use((req, res, next) => {
    req.log = logger;
    next();
});

app.use(authenticate);


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((err, req, res, next) => {
  req.log.error({ 
      method: req.method, 
      path: req.path, 
      message: err.message 
  }, 'Unhandled exception');
  
  res.status(500).json({ detail: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Service running on port ${PORT}`);
});

module.exports = app;
