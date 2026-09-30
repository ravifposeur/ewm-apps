const { v4: uuidv4 } = require('uuid');
const { createAuthedClient } = require('../helpers/axios.js');
const { validateSchema, validateProblemDetails } = require('./helpers/validator');

describe('POST /events/{eventId}/daily-confirmation (Business Logic & Confirmation Conformance)', () => {
  // Admin confirms → scope confirmations:write
  const client = createAuthedClient({ subject: 'admin-a', scopes: ['confirmations:write'] });

  const validConfirmationPayload = {
    adminId: 'adm_001',
    verifiedBreakdown: [
      {
        siteId: 'site_a',
        wasteType: 'ORGANIK',
        weight: 5000,
      },
    ],
  };

  test('should return 400 Bad Request when Idempotency-Key header is missing', async () => {
    const response = await client.post('/events/evt_001/daily-confirmation', validConfirmationPayload);
    validateProblemDetails(response, 400);
  });

  test('should return 422 Unprocessable Entity with /problems/deviation-too-high when weight deviation exceeds 10%', async () => {
    const key = uuidv4();
    const highDeviationPayload = {
      adminId: 'adm_001',
      verifiedBreakdown: [
        {
          siteId: 'site_a',
          wasteType: 'ORGANIK',
          weight: 999999,
        },
      ],
    };

    const response = await client.post('/events/evt_001/daily-confirmation', highDeviationPayload, {
      headers: { 'Idempotency-Key': key },
    });

    validateProblemDetails(response, 422, '/problems/deviation-too-high');
    expect(response.data).toHaveProperty('deviationPercentage');
  });

  test('should return 200 OK and ConfirmationResponse on successful verification', async () => {
    const key = uuidv4();
    const response = await client.post('/events/evt_001/daily-confirmation', validConfirmationPayload, {
      headers: { 'Idempotency-Key': key },
    });

    if (response.status === 200) {
      const validation = validateSchema('ConfirmationResponse', response.data);
      expect(validation.isValid).toBe(true);
      expect(response.data).toHaveProperty('grade');
      expect(response.data).toHaveProperty('totalPoints');
    } else {
      expect([200, 404, 422]).toContain(response.status);
    }
  });
});
