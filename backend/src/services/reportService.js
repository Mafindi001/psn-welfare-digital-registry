'use strict';

const { prisma } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Generate a structured report based on type and optional params.
 * @param {string} type  - 'members' | 'reminders' | 'events' | 'activity'
 * @param {Object} params - extra filter params (unused in basic implementation)
 * @returns {{ type, generated, data }}
 */
async function generateReport(type, params = {}) {
    const generated = new Date();

    try {
        switch (type) {
            case 'members': {
                // Count by status
                const byStatusRaw = await prisma.member.groupBy({
                    by: ['isActive'],
                    _count: { id: true },
                });
                const byStatus = byStatusRaw.map((r) => ({
                    status: r.isActive ? 'active' : 'inactive',
                    count: r._count.id,
                }));

                // Count by memberType if the field exists
                let byType = [];
                try {
                    const byTypeRaw = await prisma.member.groupBy({
                        by: ['memberType'],
                        _count: { id: true },
                    });
                    byType = byTypeRaw.map((r) => ({
                        type: r.memberType,
                        count: r._count.id,
                    }));
                } catch (_) {
                    // memberType field may not exist; skip gracefully
                }

                // Growth: new members per month for the last 6 months
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                const recentMembers = await prisma.member.findMany({
                    where: { createdAt: { gte: sixMonthsAgo } },
                    select: { createdAt: true },
                    orderBy: { createdAt: 'asc' },
                });

                // Group by year-month
                const growthMap = {};
                for (const m of recentMembers) {
                    const key = `${m.createdAt.getFullYear()}-${String(m.createdAt.getMonth() + 1).padStart(2, '0')}`;
                    growthMap[key] = (growthMap[key] || 0) + 1;
                }
                const growth = Object.entries(growthMap).map(([month, count]) => ({ month, count }));

                const total = await prisma.member.count();

                return { type, generated, data: { total, byStatus, byType, growth } };
            }

            case 'reminders': {
                const byStatusRaw = await prisma.reminderLog.groupBy({
                    by: ['status'],
                    _count: { id: true },
                });
                const byStatus = byStatusRaw.map((r) => ({
                    status: r.status,
                    count: r._count.id,
                }));

                const total = await prisma.reminderLog.count();

                return { type, generated, data: { total, byStatus } };
            }

            case 'events': {
                const now = new Date();
                const upcoming = await prisma.specialDate.findMany({
                    where: {
                        isActive: true,
                    },
                    include: {
                        member: { select: { fullName: true, email: true, psnNumber: true } },
                    },
                    orderBy: { date: 'asc' },
                    take: 100,
                });

                return { type, generated, data: { upcoming, count: upcoming.length } };
            }

            case 'activity': {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const byActionRaw = await prisma.auditLog.groupBy({
                    by: ['action'],
                    _count: { id: true },
                    where: { createdAt: { gte: thirtyDaysAgo } },
                    orderBy: { _count: { id: 'desc' } },
                });

                const byAction = byActionRaw.map((r) => ({
                    action: r.action,
                    count: r._count.id,
                }));

                const total = await prisma.auditLog.count({
                    where: { createdAt: { gte: thirtyDaysAgo } },
                });

                return { type, generated, data: { total, period: '30 days', byAction } };
            }

            default:
                return { type, generated, data: {} };
        }
    } catch (err) {
        logger.error(`reportService.generateReport(${type}) error:`, err);
        return { type, generated, data: {}, error: err.message };
    }
}

/**
 * Export data in the requested format.
 * @param {string} format - 'json' | 'csv'
 * @param {any}    data
 * @returns {string}
 */
function exportData(format, data) {
    if (format === 'json') {
        return JSON.stringify(data, null, 2);
    }

    if (format === 'csv') {
        // Handle arrays of objects; fall back to JSON for other shapes
        const rows = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);

        if (rows.length === 0) {
            return '';
        }

        const headers = Object.keys(rows[0]);
        const headerRow = headers.join(',');

        const dataRows = rows.map((row) =>
            headers
                .map((h) => {
                    const val = row[h];
                    // Wrap in quotes if the value contains commas, quotes, or newlines
                    const str = val === null || val === undefined ? '' : String(val);
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                })
                .join(',')
        );

        return [headerRow, ...dataRows].join('\n');
    }

    // Default: JSON
    return JSON.stringify(data, null, 2);
}

module.exports = { generateReport, exportData };
