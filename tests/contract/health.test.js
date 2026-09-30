const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('GET /health (Healthcheck Conformance)', () => {
  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true // Jangan throw exception pada non-2xx status
  });

  test('should return 200 OK without evaluating database dependency', async () => {
    const response = await client.get('/health');
    expect(response.status).toBe(200);
  });
});
