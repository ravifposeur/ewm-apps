const { createAuthedClient } = require('../helpers/axios.js');
const { validateSchema, validateProblemDetails } = require('./helpers/validator');

describe('GET /events & GET /events/{eventId} (Read Operations Conformance)', () => {
  const client = createAuthedClient({ subject: 'organizer-a', scopes: ['events:read'] });

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
      const response = await client.get('/events/@@invalid_id$$');
      validateProblemDetails(response, 400);
    });

    test('should return 404 Not Found with Problem Details when eventId is valid but does not exist', async () => {
      const response = await client.get('/events/evt_nonexistent99999');
      validateProblemDetails(response, 404, '/problems/not-found');
    });
  });
});
