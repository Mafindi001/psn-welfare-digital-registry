'use strict';

const express = require('express');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');
const { generateReport, exportData } = require('../services/reportService');
const auditService = require('../services/auditService');

const router = express.Router();

// All report routes require authentication and admin privileges
router.use(auth, adminOnly);

/**
 * POST /reports/generate
 * Generate a report of the specified type.
 * Body: { type, params }
 */
router.post('/generate', async (req, res) => {
    try {
        const { type, params } = req.body;

        if (!type) {
            return res.status(400).json({ error: 'Report type is required' });
        }

        const report = await generateReport(type, params || {});

        // Log the report generation action
        await auditService.log({
            userId: req.user.id,
            action: 'REPORT_GENERATED',
            entityType: 'report',
            entityId: null,
            details: { type, params: params || {} },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        });

        return res.status(200).json(report);
    } catch (err) {
        logger.error('POST /reports/generate error:', err);
        return res.status(500).json({ error: 'Failed to generate report' });
    }
});

/**
 * GET /reports/export
 * Generate a report and return it as a file download.
 * Query params: type, format ('json' | 'csv')
 */
router.get('/export', async (req, res) => {
    try {
        const { type, format = 'json' } = req.query;

        if (!type) {
            return res.status(400).json({ error: 'Report type is required' });
        }

        const report = await generateReport(type, {});
        const exported = exportData(format, report);

        const ext = format === 'csv' ? 'csv' : 'json';
        const filename = `report-${type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
        const contentType = format === 'csv' ? 'text/csv' : 'application/json';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        return res.status(200).send(exported);
    } catch (err) {
        logger.error('GET /reports/export error:', err);
        return res.status(500).json({ error: 'Failed to export report' });
    }
});

module.exports = router;
