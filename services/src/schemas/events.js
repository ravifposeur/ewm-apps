// service/src/schemas/events.js
const Joi = require('joi');

const createEventSchema = Joi.object({
  organizerId: Joi.string().required(),
  name: Joi.string().required(),
  scheduledDate: Joi.date().iso().optional(),
  targetWeight: Joi.number().integer().min(0).optional(),
  pointsMultiplier: Joi.number().min(0).optional(),
  bonusMultiplier: Joi.number().min(0).optional(),
});

const listEventsQuerySchema = Joi.object({
  organizerId: Joi.string().optional(),
  status: Joi.string().valid('draft', 'active', 'verifying', 'completed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = { createEventSchema, listEventsQuerySchema };
