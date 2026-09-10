// services/src/routes/events.js
const express = require('express');
const router = express.Router();
const store = require('../store');
const { representEvent, representEventList } = require('../representations/event');
const { createProblem } = require('../problem');
const { listEventsQuerySchema } = require('../schemas/events');

// Regex pattern for valid event IDs (alphanumeric, hyphens, underscores)
const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /events
 * List events with optional filtering by organizerId and status
 */
router.get('/', async (req, res, next) => {
  try {
    // Validate query parameters
    const { error, value } = listEventsQuerySchema.validate(req.query, { allowUnknown: true });
    if (error) {
      const problem = createProblem(
        'invalid-query',
        'Bad Request',
        400,
        error.message,
        req.originalUrl
      );
      problem.type = '/problems/invalid-query';
      res.setHeader('Content-Type', 'application/problem+json');
      return res.status(400).json(problem);
    }

    // Fetch all events from store
    const rawEvents = await store.findAllEvents();

    // Filter in memory if query parameters present
    let filteredEvents = rawEvents || [];

    if (value.organizerId) {
      filteredEvents = filteredEvents.filter(
        (e) => (e.organizer_id || e.organizerId) === value.organizerId
      );
    }

    if (value.status) {
      filteredEvents = filteredEvents.filter(
        (e) => e.status === value.status
      );
    }

    // Transform database rows to OpenAPI Event representations
    const representations = representEventList(filteredEvents);

    // Collection response: 200 OK with array (empty array if no matches, never 404)
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(representations);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /events/:id
 * Get a single event by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate ID format BEFORE accessing database
    if (!id || !VALID_ID_REGEX.test(id)) {
      const problem = createProblem(
        'invalid-id',
        'Bad Request',
        400,
        `Malformed event ID format: '${id}'`,
        req.originalUrl
      );
      problem.type = '/problems/invalid-id';
      res.setHeader('Content-Type', 'application/problem+json');
      return res.status(400).json(problem);
    }

    // Fetch event from store
    const rawEvent = await store.findEventById(id);

    // If not found -> 404
    if (!rawEvent) {
      const problem = createProblem(
        'not-found',
        'Event Not Found',
        404,
        `Event with ID '${id}' was not found`,
        req.originalUrl
      );
      problem.type = '/problems/not-found';
      res.setHeader('Content-Type', 'application/problem+json');
      return res.status(404).json(problem);
    }

    // Transform to OpenAPI representation
    const representation = representEvent(rawEvent);

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(representation);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
