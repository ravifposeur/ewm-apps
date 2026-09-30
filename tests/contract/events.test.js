const axios = require('axios');
const { validateSchema, validateProblemDetails } = require('./helpers/validator');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('GET /events & GET /events/{eventId} (Read Operations Conformance)', () => {
  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true
  });

  describe('GET /events (Collection)', () => {
    test('should return 200 OK and an array conforming to Event schema (empty array allowed, never 404)', async () => {
      const response = await client.get('/events');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);

      for (const item of response.data) {
        const validation = validateSchema('Event', item);
        expect(validation.isValid).toBe(true);
      }
    });

    test('should support status filter query parameter', async () => {
      const response = await client.get('/events?status=active');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);

      for (const item of response.data) {
        expect(item.status).toBe('active');
      }
    });
  });

  describe('GET /events/{eventId} (Single Entity)', () => {
    test('should return 400 Bad Request with Problem Details when eventId is malformed', async () => {
      const malformedId = '@@invalid_id$$';
      const response = await client.get(`/events/${malformedId}`);
      
      validateProblemDetails(response, 400);
    });

    test('should return 404 Not Found with Problem Details when eventId is valid but does not exist', async () => {
      const nonExistentId = 'evt_nonexistent99999';
      const response = await client.get(`/events/${nonExistentId}`);

      validateProblemDetails(response, 404, '/problems/not-found');
    });
  });
});
