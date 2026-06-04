'use strict';

const express = require('express');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');
const backupService = require('../services/backupService');

const router = express.Router();

// All backup routes require authentication and admin privileges
router.use(auth, adminOnly);

/**
 * GET /backup
 * List all backups.
 */
router.get('/', async (req, res) => {
    try {
        const backups = await backupService.listBackups();
        return res.status(200).json(backups);
    } catch (err) {
        logger.error('GET /backup error:', err);
        return res.status(500).json({ error: 'Failed to list backups' });
    }
});

/**
 * POST /backup
 * Create a new backup.
 */
router.post('/', async (req, res) => {
    try {
        const result = await backupService.createBackup(req.user.id);
        return res.status(201).json(result);
    } catch (err) {
        logger.error('POST /backup error:', err);
        return res.status(500).json({ error: 'Failed to create backup' });
    }
});

/**
 * GET /backup/stats
 * Get backup statistics.
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await backupService.getBackupStats();
        return res.status(200).json(stats);
    } catch (err) {
        logger.error('GET /backup/stats error:', err);
        return res.status(500).json({ error: 'Failed to retrieve backup stats' });
    }
});

/**
 * GET /backup/:id
 * Get a specific backup by ID.
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const backup = await prisma.backup.findUnique({ where: { id } });

        if (!backup) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        return res.status(200).json(backup);
    } catch (err) {
        logger.error('GET /backup/:id error:', err);
        return res.status(500).json({ error: 'Failed to retrieve backup' });
    }
});

/**
 * POST /backup/:id/restore
 * Restore from a specific backup.
 */
router.post('/:id/restore', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await backupService.restoreBackup(id, req.user.id);
        return res.status(200).json(result);
    } catch (err) {
        logger.error('POST /backup/:id/restore error:', err);
        return res.status(500).json({ error: 'Failed to restore backup' });
    }
});

module.exports = router;
