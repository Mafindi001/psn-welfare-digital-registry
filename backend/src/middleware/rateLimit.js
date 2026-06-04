'use strict';

const rateLimit = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const limitResponse = (_req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
};

/**
 * General API limiter: 100 requests per 15 minutes.
 */
const apiLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitResponse,
});

/**
 * Auth limiter (login / register): 10 requests per 15 minutes.
 */
const authLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitResponse,
});

/**
 * Strict limiter (password reset etc.): 5 requests per 15 minutes.
 */
const strictLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitResponse,
});

module.exports = { apiLimiter, authLimiter, strictLimiter };
