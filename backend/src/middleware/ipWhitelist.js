const { prisma } = require('../config/database');
const logger = require('../utils/logger');

class IPWhitelist {
    constructor() {
        this.whitelist = new Set();
        this.adminIPs = new Set();
        this.loadWhitelist();

        // Reload whitelist every 5 minutes
        setInterval(() => this.loadWhitelist(), 5 * 60 * 1000);
    }

    async loadWhitelist() {
        try {
            const whitelistEntries = await prisma.ipWhitelist.findMany({
                where: { enabled: true }
            });

            this.whitelist.clear();
            this.adminIPs.clear();

            whitelistEntries.forEach(entry => {
                if (entry.isAdminIP) {
                    this.adminIPs.add(entry.ipAddress);
                } else {
                    this.whitelist.add(entry.ipAddress);
                }
            });

            logger.info(`✅ IP whitelist loaded: ${this.whitelist.size} regular IPs, ${this.adminIPs.size} admin IPs`);

        } catch (error) {
            logger.error('❌ Failed to load IP whitelist:', error);
        }
    }

    middleware(req, res, next) {
        const clientIP = this.getClientIP(req);
        const path = req.path;
        const user = req.user;

        // Allow health check endpoint
        if (path === '/health') {
            return next();
        }

        // Allow authentication endpoints
        if (path.startsWith('/api/auth')) {
            return next();
        }

        // Check if IP is in whitelist
        if (this.whitelist.has(clientIP)) {
            return next();
        }

        // Check for admin endpoints
        if (path.startsWith('/api/admin')) {
            if (this.adminIPs.has(clientIP)) {
                return next();
            }

            // Log unauthorized admin access attempt
            logger.warn(`🚫 Unauthorized admin access attempt from IP: ${clientIP}`, {
                path,
                user: user?.id,
                userAgent: req.get('User-Agent')
            });

            return res.status(403).json({
                error: 'Access denied',
                message: 'Admin access restricted to authorized IP addresses'
            });
        }

        // For regular API endpoints, check if IP is allowed
        if (this.isIPAllowed(clientIP)) {
            return next();
        }

        // Log blocked access attempt
        logger.warn(`🚫 Blocked access attempt from IP: ${clientIP}`, {
            path,
            user: user?.id,
            userAgent: req.get('User-Agent')
        });

        res.status(403).json({
            error: 'Access denied',
            message: 'Your IP address is not authorized to access this resource'
        });
    }

    getClientIP(req) {
        // Get client IP from various headers
        return req.ip ||
            req.headers['x-forwarded-for']?.split(',')[0] ||
            req.connection.remoteAddress;
    }

    isIPAllowed(ip) {
        // Check exact match
        if (this.whitelist.has(ip)) {
            return true;
        }

        // Check CIDR ranges
        for (const whitelistedIP of this.whitelist) {
            if (this.isIPInRange(ip, whitelistedIP)) {
                return true;
            }
        }

        return false;
    }

    isIPInRange(ip, range) {
        // Check if range is CIDR notation
        if (range.includes('/')) {
            const [rangeIP, prefix] = range.split('/');
            const mask = this.cidrToMask(parseInt(prefix));

            const ipLong = this.ipToLong(ip);
            const rangeIPLong = this.ipToLong(rangeIP);
            const maskLong = mask; // cidrToMask already returns a Long integer

            return (ipLong & maskLong) === (rangeIPLong & maskLong);
        }

        return ip === range;
    }

    ipToLong(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    }

    cidrToMask(prefix) {
        return (-1 << (32 - prefix)) >>> 0;
    }

    // Admin methods for managing whitelist
    async addIP(ip, isAdminIP = false, notes = '', addedBy) {
        try {
            const existing = await prisma.ipWhitelist.findUnique({
                where: { ipAddress: ip }
            });

            if (existing) {
                await prisma.ipWhitelist.update({
                    where: { ipAddress: ip },
                    data: {
                        enabled: true,
                        isAdminIP,
                        notes,
                        updatedAt: new Date(),
                        updatedBy: addedBy
                    }
                });
            } else {
                await prisma.ipWhitelist.create({
                    data: {
                        ipAddress: ip,
                        isAdminIP,
                        notes,
                        addedBy,
                        enabled: true
                    }
                });
            }

            // Reload whitelist
            await this.loadWhitelist();

            // Log addition
            await prisma.auditLog.create({
                data: {
                    userId: addedBy,
                    action: 'IP_WHITELIST_ADDED',
                    details: { ip, isAdminIP, notes },
                    ipAddress: ip
                }
            });

            logger.info(`✅ IP added to whitelist: ${ip} (${isAdminIP ? 'admin' : 'regular'})`);

            return { success: true };

        } catch (error) {
            logger.error('❌ Failed to add IP to whitelist:', error);
            throw error;
        }
    }

    async removeIP(ip, removedBy) {
        try {
            await prisma.ipWhitelist.update({
                where: { ipAddress: ip },
                data: {
                    enabled: false,
                    updatedAt: new Date(),
                    updatedBy: removedBy
                }
            });

            // Reload whitelist
            await this.loadWhitelist();

            // Log removal
            await prisma.auditLog.create({
                data: {
                    userId: removedBy,
                    action: 'IP_WHITELIST_REMOVED',
                    details: { ip },
                    ipAddress: ip
                }
            });

            logger.info(`✅ IP removed from whitelist: ${ip}`);

            return { success: true };

        } catch (error) {
            logger.error('❌ Failed to remove IP from whitelist:', error);
            throw error;
        }
    }

    async listWhitelist() {
        try {
            return await prisma.ipWhitelist.findMany({
                where: { enabled: true },
                orderBy: { createdAt: 'desc' },
                include: {
                    addedByUser: {
                        select: { fullName: true, psnNumber: true }
                    }
                }
            });
        } catch (error) {
            logger.error('❌ Failed to list whitelist:', error);
            throw error;
        }
    }

    async getWhitelistStats() {
        try {
            const stats = await prisma.$transaction([
                prisma.ipWhitelist.count({ where: { enabled: true } }),
                prisma.ipWhitelist.count({ where: { enabled: true, isAdminIP: true } }),
                prisma.ipWhitelist.count({ where: { enabled: false } })
            ]);

            return {
                totalActive: stats[0],
                adminIPs: stats[1],
                inactive: stats[2]
            };
        } catch (error) {
            logger.error('❌ Failed to get whitelist stats:', error);
            throw error;
        }
    }
}

// Create singleton instance
const ipWhitelist = new IPWhitelist();

// Export middleware and instance
module.exports = {
    ipWhitelistMiddleware: (req, res, next) => ipWhitelist.middleware(req, res, next),
    ipWhitelist
};