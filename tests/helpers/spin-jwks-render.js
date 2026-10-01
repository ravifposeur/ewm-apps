// tests/helpers/spin-jwks-render.js
// Production entry point for JWKS server on Railway/Render.
// Listen di 0.0.0.0 supaya bisa diakses dari luar container.
const { jwksServer } = require('./tokens.js');

const PORT = parseInt(process.env.PORT || '9999', 10);

jwksServer.listen(PORT, '0.0.0.0', () => {
  console.log(`JWKS server listening on 0.0.0.0:${PORT}`);
  console.log(`Railway public URL will be: https://<your-domain>/jwks.json`);
  console.log(`Sign endpoint: POST https://<your-domain>/sign`);
});

jwksServer.on('error', (err) => {
  console.error('JWKS server error:', err);
  process.exit(1);
});
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  jwksServer.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
