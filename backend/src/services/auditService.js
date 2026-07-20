'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

const auditService = {
    /**
     * Create an audit log entry. Silently catches and logs errors.
     */
    async log({ userId, action, entityType, entityId, details, ipAddress, userAgent } = {}) {
        try {
            await prisma.auditLog.create({
                data: {
                    userId: userId || null,
                    action,
                    entityType: entityType || null,
                    entityId: entityId || null,
                    details: details || {},
                    ipAddress: ipAddress || null,
                    userAgent: userAgent || null,
                },
            });
        } catch (err) {
            logger.error('auditService.log error:', err);
        }
    },

    /**
     * Return paginated audit logs with optional filters.
     * @param {Object} opts
     * @param {number} [opts.page=1]
     * @param {number} [opts.limit=50]
     * @param {string} [opts.action]
     * @param {string} [opts.userId]
     * @param {string} [opts.startDate]
     * @param {string} [opts.endDate]
     * @returns {{ data, total, page, totalPages }}
     */
    async getLogs({ page = 1, limit = 50, action, userId, startDate, endDate } = {}) {
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const skip = (pageNum - 1) * pageLimit;

        const where = {};

        if (action) {
            where.action = action;
        }

        if (userId) {
            where.userId = userId;
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                where.createdAt.lte = new Date(endDate);
            }
        }

        try {
            const [data, total] = await Promise.all([
                prisma.auditLog.findMany({
                    where,
                    skip,
                    take: pageLimit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: { fullName: true, email: true, psnNumber: true },
                        },
                    },
                }),
                prisma.auditLog.count({ where }),
            ]);

            return {
                data,
                total,
                page: pageNum,
                totalPages: Math.ceil(total / pageLimit),
            };
        } catch (err) {
            logger.error('auditService.getLogs error:', err);
            return { data: [], total: 0, page: pageNum, totalPages: 0 };
        }
    },

    /**
     * Return aggregate statistics about audit logs.
     * @returns {{ total, today, thisWeek, byAction }}
     */
    async getStats() {
        try {
            const now = new Date();

            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);

            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);

            const [total, today, thisWeek, byActionRaw] = await Promise.all([
                prisma.auditLog.count(),
                prisma.auditLog.count({
                    where: { createdAt: { gte: startOfToday } },
                }),
                prisma.auditLog.count({
                    where: { createdAt: { gte: startOfWeek } },
                }),
                prisma.auditLog.groupBy({
                    by: ['action'],
                    _count: { action: true },
                    orderBy: { _count: { action: 'desc' } },
                }),
            ]);

            const byAction = byActionRaw.map((row) => ({
                action: row.action,
                count: row._count.action,
            }));

            return { total, today, thisWeek, byAction };
        } catch (err) {
            logger.error('auditService.getStats error:', err);
            return { total: 0, today: 0, thisWeek: 0, byAction: [] };
        }
    },
};

module.exports = auditService;
