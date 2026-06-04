'use strict';

const express = require('express');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');
const auditService = require('../services/auditService');

const router = express.Router();

// All audit routes require authentication and admin privileges
router.use(auth, adminOnly);

/**
 * GET /audit
 * Return paginated audit logs with optional filters.
 * Query params: page, limit, action, userId, startDate, endDate
 */
router.get('/', async (req, res) => {
    try {
        const result = await auditService.getLogs(req.query);
        return res.status(200).json(result);
    } catch (err) {
        logger.error('GET /audit error:', err);
        return res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
});

/**
 * GET /audit/stats
 * Return aggregate audit log statistics.
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await auditService.getStats();
        return res.status(200).json(stats);
    } catch (err) {
        logger.error('GET /audit/stats error:', err);
        return res.status(500).json({ error: 'Failed to retrieve audit stats' });
    }
});

/**
 * GET /audit/export
 * Export all matching audit logs as a JSON file download.
 * Query params: same as GET / (page, limit, action, userId, startDate, endDate)
 */
router.get('/export', async (req, res) => {
    try {
        const result = await auditService.getLogs({ ...req.query, limit: 10000 });

        const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.json`;
        const json = JSON.stringify(result, null, 2);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.status(200).send(json);
    } catch (err) {
        logger.error('GET /audit/export error:', err);
        return res.status(500).json({ error: 'Failed to export audit logs' });
    }
});

module.exports = router;
