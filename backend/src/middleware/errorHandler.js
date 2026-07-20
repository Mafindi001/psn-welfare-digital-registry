'use strict';

const logger = require('../utils/logger');

/**
 * Global Express error handler.
 * Must be registered as a 4-argument middleware: app.use(errorHandler).
 * Logs the error and responds with JSON. Includes the stack trace in development.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    logger.error(`${status} ${req.method} ${req.path} — ${message}`, {
        stack: err.stack,
        userId: req.user?.id,
    });

    const body = { error: message };

    if (process.env.NODE_ENV !== 'production') {
        body.stack = err.stack;
    }

    res.status(status).json(body);
}

module.exports = { errorHandler };
