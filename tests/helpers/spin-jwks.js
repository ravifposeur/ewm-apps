// tests/helpers/spin-jwks.js
const { startJwksServer } = require('./tokens.js');

(async () => {
  const url = await startJwksServer(9999);
  console.log(`JWKS listening on ${url}/jwks.json`);
  console.log('Tekan Ctrl+C untuk stop');
})();
