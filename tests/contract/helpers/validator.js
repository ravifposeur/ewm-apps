const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

let ajvInstance = null;
let openApiDoc = null;

function loadOpenApiSpec() {
  if (openApiDoc) return openApiDoc;
  const specPath = path.resolve(__dirname, '../../../openapi.yaml');
  const fileContent = fs.readFileSync(specPath, 'utf8');
  openApiDoc = YAML.parse(fileContent);
  return openApiDoc;
}

function getAjv() {
  if (ajvInstance) return ajvInstance;

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    coerceTypes: false
  });
  addFormats(ajv);

  const spec = loadOpenApiSpec();
  if (spec.components && spec.components.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      ajv.addSchema(schema, `#/components/schemas/${name}`);
    }
  }

  ajvInstance = ajv;
  return ajvInstance;
}

/**
 * Validates a payload against an OpenAPI component schema.
 */
function validateSchema(schemaName, data) {
  const ajv = getAjv();
  const schemaRef = `#/components/schemas/${schemaName}`;
  const validate = ajv.getSchema(schemaRef);

  if (!validate) {
    throw new Error(`Schema ${schemaRef} not found in openapi.yaml`);
  }

  const isValid = validate(data);
  return {
    isValid,
    errors: validate.errors
  };
}

/**
 * Validates that an HTTP error response strictly conforms to RFC 9457 Problem Details.
 */
function validateProblemDetails(response, expectedStatus, expectedTypeUri = null) {
  expect(response).toBeDefined();
  expect(response.status).toBe(expectedStatus);

  const contentType = response.headers['content-type'] || response.headers['Content-Type'] || '';
  expect(contentType.toLowerCase()).toMatch(/application\/problem\+json/);

  const body = response.data;
  expect(body).toBeDefined();
  expect(typeof body).toBe('object');

  // RFC 9457 Required fields
  expect(body).toHaveProperty('type');
  expect(body).toHaveProperty('title');
  expect(body).toHaveProperty('status');

  expect(typeof body.type).toBe('string');
  expect(typeof body.title).toBe('string');
  expect(body.status).toBe(expectedStatus);

  if (expectedTypeUri) {
    expect(body.type).toContain(expectedTypeUri);
  }

  return true;
}

module.exports = {
  loadOpenApiSpec,
  validateSchema,
  validateProblemDetails
};
