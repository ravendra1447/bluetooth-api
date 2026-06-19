const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const formattedErrors = {};
  errors.array().forEach(error => {
    formattedErrors[error.path] = error.msg;
  });

  return res.status(422).json({
    success: false,
    message: 'Validation failed',
    errors: formattedErrors
  });
};

// Owner registration validation
const validateOwnerRegistration = [
  body('name')
    .trim()
    .notEmpty().withMessage('The name field is required.')
    .isLength({ max: 255 }).withMessage('The name must not exceed 255 characters.'),
  body('phone')
    .trim()
    .notEmpty().withMessage('The phone field is required.')
    .isLength({ min: 10, max: 15 }).withMessage('The phone must be valid.')
    .matches(/^[0-9]+$/).withMessage('The phone must contain only digits.'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('The email must be a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('The password field is required.')
    .isLength({ min: 6 }).withMessage('The password must be at least 6 characters.'),
  body('password_confirmation')
    .notEmpty().withMessage('The password confirmation field is required.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('The password confirmation must match password.');
      }
      return true;
    }),
  validate
];

// Tenant registration validation
const validateTenantRegistration = [
  body('name')
    .trim()
    .notEmpty().withMessage('The name field is required.')
    .isLength({ max: 255 }).withMessage('The name must not exceed 255 characters.'),
  body('phone')
    .trim()
    .notEmpty().withMessage('The phone field is required.')
    .isLength({ min: 10, max: 15 }).withMessage('The phone must be valid.')
    .matches(/^[0-9]+$/).withMessage('The phone must contain only digits.'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('The email must be a valid email address.')
    .normalizeEmail(),
  body('password')
    .notEmpty().withMessage('The password field is required.')
    .isLength({ min: 6 }).withMessage('The password must be at least 6 characters.'),
  body('password_confirmation')
    .notEmpty().withMessage('The password confirmation field is required.')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('The password confirmation must match password.');
      }
      return true;
    }),
  body('propertyCode')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 }).withMessage('The property code must be up to 50 characters.'),
  body('moveInDate')
    .optional()
    .isISO8601().withMessage('The move in date must be a valid date.'),
  validate
];

// Login validation
const validateLogin = [
  body('phone')
    .trim()
    .notEmpty().withMessage('The phone field is required.'),
  body('password')
    .notEmpty().withMessage('The password field is required.'),
  validate
];

// Property validation
const validateProperty = [
  body('propertyName')
    .trim()
    .notEmpty().withMessage('The propertyName field is required.')
    .isLength({ max: 150 }).withMessage('The propertyName must not exceed 150 characters.'),
  body('address')
    .optional()
    .trim(),
  body('city')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('The city must not exceed 50 characters.'),
  body('state')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('The state must not exceed 50 characters.'),
  body('pincode')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('The pincode must not exceed 20 characters.'),
  body('rent')
    .optional()
    .isFloat({ min: 0 }).withMessage('The rent must be a positive number.'),
  body('status')
    .optional()
    .isIn(['active', 'inactive']).withMessage('The status must be either active or inactive.'),
  validate
];

// Meter validation
const validateMeter = [
  body('meterNumber')
    .trim()
    .notEmpty().withMessage('The meter number field is required.')
    .isLength({ max: 100 }).withMessage('The meter number must not exceed 100 characters.'),
  body('bluetoothId')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('The bluetooth id must not exceed 100 characters.'),
  body('meterType')
    .optional()
    .isIn(['prepaid', 'postpaid']).withMessage('The meter type must be either prepaid or postpaid.'),
  body('tariff')
    .optional()
    .isFloat({ min: 0 }).withMessage('The tariff must be a positive number.'),
  body('balance')
    .optional()
    .isFloat().withMessage('The balance must be a number.'),
  body('status')
    .optional()
    .isIn(['active', 'inactive']).withMessage('The status must be either active or inactive.'),
  validate
];

// Tenant assignment validation
const validateTenantAssignment = [
  body('userId')
    .notEmpty().withMessage('The user id field is required.')
    .isInt().withMessage('The user id must be an integer.'),
  body('propertyId')
    .notEmpty().withMessage('The property id field is required.')
    .isInt().withMessage('The property id must be an integer.'),
  body('moveInDate')
    .optional()
    .isISO8601().withMessage('The move in date must be a valid date.'),
  body('status')
    .optional()
    .isIn(['active', 'left']).withMessage('The status must be either active or left.'),
  validate
];

// Owner update validation
const validateOwnerUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('The name must not exceed 100 characters.'),
  body('status')
    .optional()
    .isIn(['active', 'inactive']).withMessage('The status must be active or inactive.'),
  validate
];

module.exports = {
  validate,
  validateOwnerRegistration,
  validateTenantRegistration,
  validateLogin,
  validateProperty,
  validateMeter,
  validateTenantAssignment,
  validateOwnerUpdate
};
