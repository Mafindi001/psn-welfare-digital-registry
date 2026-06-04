'use strict';

jest.mock('../config/database', () => require('./__mocks__/prisma'));
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { prisma } = require('../config/database');

// Prevent the constructor's auto-load and interval from running during import
prisma.ipWhitelist.findMany.mockResolvedValue([]);

const { ipWhitelist, ipWhitelistMiddleware } = require('../middleware/ipWhitelist');

beforeEach(() => {
    jest.clearAllMocks();
    // Reset internal sets to a clean state before each test
    ipWhitelist.whitelist.clear();
    ipWhitelist.adminIPs.clear();
});

// ─── isIPInRange (CIDR matching) ──────────────────────────────────────────────

describe('isIPInRange', () => {
    it('returns true for an IP inside a /24 block', () => {
        expect(ipWhitelist.isIPInRange('192.168.1.50', '192.168.1.0/24')).toBe(true);
    });

    it('returns true for the network address itself', () => {
        expect(ipWhitelist.isIPInRange('192.168.1.0', '192.168.1.0/24')).toBe(true);
    });

    it('returns true for the broadcast address', () => {
        expect(ipWhitelist.isIPInRange('192.168.1.255', '192.168.1.0/24')).toBe(true);
    });

    it('returns false for an IP outside the /24 block', () => {
        expect(ipWhitelist.isIPInRange('192.168.2.1', '192.168.1.0/24')).toBe(false);
    });

    it('returns true for an IP inside a /16 block', () => {
        expect(ipWhitelist.isIPInRange('10.20.99.1', '10.20.0.0/16')).toBe(true);
    });

    it('returns false for an IP outside a /16 block', () => {
        expect(ipWhitelist.isIPInRange('10.21.0.1', '10.20.0.0/16')).toBe(false);
    });

    it('returns true for an exact match without CIDR notation', () => {
        expect(ipWhitelist.isIPInRange('1.2.3.4', '1.2.3.4')).toBe(true);
    });

    it('returns false for a non-matching exact IP', () => {
        expect(ipWhitelist.isIPInRange('1.2.3.5', '1.2.3.4')).toBe(false);
    });

    it('handles /32 (single host) CIDR correctly', () => {
        expect(ipWhitelist.isIPInRange('10.0.0.1', '10.0.0.1/32')).toBe(true);
        expect(ipWhitelist.isIPInRange('10.0.0.2', '10.0.0.1/32')).toBe(false);
    });

    it('handles /8 block', () => {
        expect(ipWhitelist.isIPInRange('10.255.255.255', '10.0.0.0/8')).toBe(true);
        expect(ipWhitelist.isIPInRange('11.0.0.1', '10.0.0.0/8')).toBe(false);
    });
});

// ─── ipToLong ────────────────────────────────────────────────────────────────

describe('ipToLong', () => {
    it('converts 0.0.0.0 to 0', () => {
        expect(ipWhitelist.ipToLong('0.0.0.0')).toBe(0);
    });

    it('converts 255.255.255.255 to 4294967295', () => {
        expect(ipWhitelist.ipToLong('255.255.255.255')).toBe(4294967295);
    });

    it('converts 192.168.1.1 correctly', () => {
        // 192*2^24 + 168*2^16 + 1*2^8 + 1
        const expected = (192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0;
        expect(ipWhitelist.ipToLong('192.168.1.1')).toBe(expected);
    });
});

// ─── cidrToMask ───────────────────────────────────────────────────────────────

describe('cidrToMask', () => {
    it('converts prefix 24 to 255.255.255.0 equivalent', () => {
        // 0xFFFFFF00 = 4294967040
        expect(ipWhitelist.cidrToMask(24)).toBe(4294967040);
    });

    it('converts prefix 16 to 255.255.0.0 equivalent', () => {
        // 0xFFFF0000 = 4294901760
        expect(ipWhitelist.cidrToMask(16)).toBe(4294901760);
    });

    it('converts prefix 32 to all-ones mask', () => {
        expect(ipWhitelist.cidrToMask(32)).toBe(4294967295);
    });
});

// ─── isIPAllowed ──────────────────────────────────────────────────────────────

describe('isIPAllowed', () => {
    it('returns true for an exact match in the whitelist', () => {
        ipWhitelist.whitelist.add('10.0.0.1');
        expect(ipWhitelist.isIPAllowed('10.0.0.1')).toBe(true);
    });

    it('returns false when the whitelist is empty', () => {
        expect(ipWhitelist.isIPAllowed('10.0.0.1')).toBe(false);
    });

    it('returns true when IP falls inside a CIDR range in the whitelist', () => {
        ipWhitelist.whitelist.add('192.168.0.0/16');
        expect(ipWhitelist.isIPAllowed('192.168.42.99')).toBe(true);
    });

    it('returns false when IP is outside every whitelisted range', () => {
        ipWhitelist.whitelist.add('192.168.0.0/24');
        expect(ipWhitelist.isIPAllowed('10.0.0.1')).toBe(false);
    });
});

// ─── middleware ───────────────────────────────────────────────────────────────

function makeReq(ip, path, user = null) {
    return {
        ip,
        path,
        user,
        headers: {},
        get: jest.fn().mockReturnValue('TestAgent/1.0'),
        connection: { remoteAddress: ip },
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('middleware', () => {
    it('always passes /health regardless of IP', () => {
        const req = makeReq('1.2.3.4', '/health');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('always passes /api/auth/* regardless of IP', () => {
        const req = makeReq('1.2.3.4', '/api/auth/login');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('passes when the client IP is in the whitelist', () => {
        ipWhitelist.whitelist.add('5.5.5.5');
        const req = makeReq('5.5.5.5', '/api/members');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('blocks a non-whitelisted IP on a regular endpoint with 403', () => {
        const req = makeReq('9.9.9.9', '/api/members');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: 'Access denied' })
        );
    });

    it('allows an admin IP on /api/admin endpoint', () => {
        ipWhitelist.adminIPs.add('10.10.10.10');
        const req = makeReq('10.10.10.10', '/api/admin/stats');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('blocks a non-admin IP on /api/admin with 403', () => {
        const req = makeReq('1.1.1.1', '/api/admin/stats');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringMatching(/Admin access/),
            })
        );
    });

    it('a regular-whitelisted IP bypasses the admin-path guard (whitelist check fires first)', () => {
        // NOTE: this documents existing behaviour — the whitelist.has() check at line 54
        // runs before the /api/admin guard at line 59, so any IP in the regular whitelist
        // can reach admin endpoints. Consider whether this matches the intended security model.
        ipWhitelist.whitelist.add('7.7.7.7');
        const req = makeReq('7.7.7.7', '/api/admin/stats');
        const res = makeRes();
        const next = jest.fn();

        ipWhitelist.middleware(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

// ─── getClientIP ──────────────────────────────────────────────────────────────

describe('getClientIP', () => {
    it('returns req.ip when present', () => {
        const req = { ip: '1.2.3.4', headers: {}, connection: { remoteAddress: '9.9.9.9' } };
        expect(ipWhitelist.getClientIP(req)).toBe('1.2.3.4');
    });

    it('falls back to x-forwarded-for first IP when req.ip is absent', () => {
        const req = {
            ip: undefined,
            headers: { 'x-forwarded-for': '5.5.5.5, 6.6.6.6' },
            connection: { remoteAddress: '9.9.9.9' },
        };
        expect(ipWhitelist.getClientIP(req)).toBe('5.5.5.5');
    });

    it('falls back to connection.remoteAddress as last resort', () => {
        const req = {
            ip: undefined,
            headers: {},
            connection: { remoteAddress: '8.8.8.8' },
        };
        expect(ipWhitelist.getClientIP(req)).toBe('8.8.8.8');
    });
});
