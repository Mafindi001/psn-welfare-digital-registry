'use strict';

/**
 * 404 catch-all handler.
 * Register after all routes: app.use(notFound).
 */
function notFound(req, res) {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { notFound };
