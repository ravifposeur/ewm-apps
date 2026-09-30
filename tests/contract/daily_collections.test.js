const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { validateProblemDetails } = require('./helpers/validator');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

describe('POST /daily-collections (Write & Idempotency Conformance)', () => {
  const client = axios.create({
    baseURL: BASE_URL,
    validateStatus: () => true
  });

  const validPayload = {
    eventId: 'evt_001',
    rosterId: 'rost_budi',
    shiftDate: '2026-08-30',
    records: [
      {
        siteId: 'site_a',
        wasteType: 'ORGANIK',
        weight: 5000,
        recordedAt: '2026-08-30T10:30:00+07:00'
      }
    ]
  };

  test('should return 400 Bad Request when Idempotency-Key header is missing', async () => {
    const response = await client.post('/daily-collections', validPayload);
    validateProblemDetails(response, 400);
  });

  test('should return 400 Bad Request when Idempotency-Key header is not a valid UUID v4', async () => {
    const response = await client.post('/daily-collections', validPayload, {
      headers: { 'Idempotency-Key': 'invalid-not-a-uuid' }
    });
    validateProblemDetails(response, 400);
  });

  test('should successfully accept (202/201) new request with valid Idempotency-Key', async () => {
    const key = uuidv4();
    const response = await client.post('/daily-collections', validPayload, {
      headers: { 'Idempotency-Key': key }
    });

    expect([201, 202]).toContain(response.status);
  });

  test('should return identical response when repeated with identical body and same key', async () => {
    const key = uuidv4();
    
    // First request
    const response1 = await client.post('/daily-collections', validPayload, {
      headers: { 'Idempotency-Key': key }
    });
    expect([201, 202]).toContain(response1.status);

    // Repeated request with same key & identical body
    const response2 = await client.post('/daily-collections', validPayload, {
      headers: { 'Idempotency-Key': key }
    });
    
    expect(response2.status).toBe(response1.status);
    expect(response2.data).toEqual(response1.data);
  });

  test('should return 409 Conflict (/problems/idempotency-key-reuse) when key is reused with different body', async () => {
    const key = uuidv4();

    // First request
    const response1 = await client.post('/daily-collections', validPayload, {
      headers: { 'Idempotency-Key': key }
    });
    expect([201, 202]).toContain(response1.status);

    // Second request with SAME key but DIFFERENT body
    const differentPayload = {
      ...validPayload,
      records: [
        {
          siteId: 'site_a',
          wasteType: 'ANORGANIK',
          weight: 12000,
          recordedAt: '2026-08-30T11:00:00+07:00'
        }
      ]
    };

    const response2 = await client.post('/daily-collections', differentPayload, {
      headers: { 'Idempotency-Key': key }
    });

    validateProblemDetails(response2, 409, '/problems/idempotency-key-reuse');
  });
});
