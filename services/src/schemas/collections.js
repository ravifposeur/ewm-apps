// service/src/schemas/collections.js
const Joi = require('joi');

const recordSchema = Joi.object({
  siteId: Joi.string().required(),
  wasteType: Joi.string().valid('ORGANIK', 'ANORGANIK', 'RESIDU', 'HAZMAT').required(),
  weight: Joi.number().integer().min(1).required().messages({
    'number.min': 'weight must be at least 1 gram',
  }),
  recordedAt: Joi.date().iso().optional(),
});

const dailyCollectionSchema = Joi.object({
  eventId: Joi.string().required(),
  rosterId: Joi.string().required(),
  shiftDate: Joi.date().iso().required(),
  records: Joi.array().items(recordSchema).min(1).required().messages({
    'array.min': 'records must contain at least 1 item',
  }),
});

module.exports = { dailyCollectionSchema };
