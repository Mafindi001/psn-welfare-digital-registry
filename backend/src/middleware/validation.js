'use strict';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single field value against a pipe-separated rule string.
 * Rules: 'required', 'email', 'min:N', 'max:N'
 *
 * @param {string} field
 * @param {*}      value
 * @param {string} ruleString
 * @returns {string[]} Array of error messages (empty if valid)
 */
function applyRules(field, value, ruleString) {
    const errors = [];
    const rules = ruleString.split('|').map((r) => r.trim());

    const strVal = value !== undefined && value !== null ? String(value) : '';
    const isEmpty = strVal.trim().length === 0;

    for (const rule of rules) {
        if (rule === 'required') {
            if (value === undefined || value === null || isEmpty) {
                errors.push(`${field} is required`);
            }
        } else if (rule === 'email') {
            if (!isEmpty && !EMAIL_RE.test(strVal)) {
                errors.push(`${field} must be a valid email address`);
            }
        } else if (rule.startsWith('min:')) {
            const min = parseInt(rule.slice(4), 10);
            if (!isEmpty && strVal.length < min) {
                errors.push(`${field} must be at least ${min} characters`);
            }
        } else if (rule.startsWith('max:')) {
            const max = parseInt(rule.slice(4), 10);
            if (!isEmpty && strVal.length > max) {
                errors.push(`${field} must be at most ${max} characters`);
            }
        }
    }

    return errors;
}

/**
 * Body validation middleware factory.
 *
 * @param {Object.<string, string>} schema - e.g. { email: 'required|email', name: 'required|min:2' }
 * @returns {Function} Express middleware
 */
function validateBody(schema) {
    return function validationMiddleware(req, res, next) {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const fieldErrors = applyRules(field, req.body[field], rules);
            errors.push(...fieldErrors);
        }

        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        next();
    };
}

/**
 * Pagination normalisation middleware.
 * Normalises req.query.page and req.query.limit to integers.
 * Defaults: page=1, limit=10. Maximum limit: 100.
 */
function validatePagination(req, res, next) {
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    req.query.page = page;
    req.query.limit = limit;

    next();
}

module.exports = { validateBody, validatePagination };
