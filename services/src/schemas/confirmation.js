// service/src/schemas/confirmation.js
const Joi = require('joi');

const verifiedItemSchema = Joi.object({
  wasteType: Joi.string().valid('ORGANIK', 'ANORGANIK', 'RESIDU', 'HAZMAT').required(),
  weight: Joi.number().integer().min(0).required(),
});

const confirmationSchema = Joi.object({
  adminId: Joi.string().required(),
  verifiedBreakdown: Joi.array().items(verifiedItemSchema).min(1).required().messages({
    'array.min': 'verifiedBreakdown must contain at least 1 item',
  }),
});

module.exports = { confirmationSchema };
