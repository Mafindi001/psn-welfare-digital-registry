'use strict';

const { createLogger, format, transports } = require('winston');

const { combine, colorize, simple, json, timestamp } = format;

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: isDev
        ? combine(colorize(), simple())
        : combine(timestamp(), json()),
    transports: [
        new transports.Console(),
    ],
    exitOnError: false,
});

module.exports = logger;
