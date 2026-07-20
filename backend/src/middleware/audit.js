'use strict';

const { prisma } = require('../config/database');

/**
 * Derive a human-readable entity type from the request path.
 * e.g. /api/members/123 -> 'members'
 */
function deriveEntityType(path) {
    const segments = path.replace(/^\/+/, '').split('/').filter(Boolean);
    // Skip common API prefix segments
    const skip = new Set(['api', 'v1', 'v2', 'v3']);
    for (const segment of segments) {
        if (!skip.has(segment.toLowerCase())) {
            return segment;
        }
    }
    return segments[0] || 'unknown';
}

/**
 * Audit logging middleware factory.
 * Returns a middleware that — after the response finishes — creates a prisma.auditLog
 * record. Only logs when status < 400. Errors are silently ignored.
 *
 * @param {string} action - The action label, e.g. 'CREATE_MEMBER'
 */
function auditLog(action) {
    return function auditMiddleware(req, res, next) {
        res.on('finish', async () => {
            if (res.statusCode >= 400) return;

            try {
                await prisma.auditLog.create({
                    data: {
                        userId: req.user?.id ?? null,
                        action,
                        entityType: deriveEntityType(req.path),
                        ipAddress: req.ip,
                        userAgent: req.get('User-Agent') || null,
                        details: JSON.stringify({
                            method: req.method,
                            path: req.path,
                            statusCode: res.statusCode,
                        }),
                    },
                });
            } catch (_err) {
                // Silently ignore audit log errors to avoid disrupting the app
            }
        });

        next();
    };
}

module.exports = { auditLog };
