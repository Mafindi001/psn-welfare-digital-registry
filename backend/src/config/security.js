'use strict';

module.exports = {
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 min in ms
    sessionTimeout: 24 * 60 * 60 * 1000,
    passwordMinLength: 8,
    corsOrigins: (process.env.FRONTEND_URL || 'http://localhost:3000').split(','),
};
