'use strict';

// ─── Module-level mocks ───────────────────────────────────────────────────────

const mockPrisma = {
    member: { count: jest.fn(), findMany: jest.fn() },
    specialDate: { count: jest.fn() },
    reminderLog: { count: jest.fn() },
    auditLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
};

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}));

// Auth middleware: inject a fake admin user
jest.mock('../middleware/auth', () => (req, _res, next) => {
    req.user = { id: 'admin-user-id', isAdmin: true };
    next();
});

// Roles middleware: always allow
jest.mock('../middleware/roles', () => ({
    adminOnly: (_req, _res, next) => next(),
}));

// Services: stub them out
jest.mock('../services/reportService', () => ({
    generateReport: jest.fn().mockResolvedValue({ data: [] }),
    exportData: jest.fn(),
}));

jest.mock('../services/backupService', () => ({
    createBackup: jest.fn().mockResolvedValue({ id: 'backup-001' }),
    restoreBackup: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
    sendBulkEmails: jest.fn().mockResolvedValue({ sentCount: 2 }),
}));

const express = require('express');
const request = require('supertest');
const adminRouter = require('../routes/admin');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.auditLog.create.mockResolvedValue({});
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

describe('GET /api/admin/stats', () => {
    it('returns all five stat fields mapped correctly', async () => {
        // $transaction returns [totalMembers, activeMembers, upcoming, remindersSent, active24h]
        mockPrisma.$transaction.mockResolvedValue([120, 95, 5, 300, 8]);

        const res = await request(buildApp()).get('/api/admin/stats');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            totalMembers: 120,
            activeMembers: 95,
            upcomingCelebrations: 5,
            remindersSent: 300,
            activeUsers24h: 8,
            systemHealth: 'healthy',
        });
    });

    it('returns 500 when the database query throws', async () => {
        mockPrisma.$transaction.mockRejectedValue(new Error('DB down'));

        const res = await request(buildApp()).get('/api/admin/stats');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('DB down');
    });
});

// ─── GET /api/admin/members ───────────────────────────────────────────────────

describe('GET /api/admin/members', () => {
    const members = [
        { id: '1', fullName: 'Alice', email: 'a@test.com', psnNumber: 'PSN-1' },
        { id: '2', fullName: 'Bob',   email: 'b@test.com', psnNumber: 'PSN-2' },
    ];

    beforeEach(() => {
        mockPrisma.$transaction.mockResolvedValue([members, 2]);
    });

    it('returns paginated member list with metadata', async () => {
        const res = await request(buildApp()).get('/api/admin/members?page=1&limit=10');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.total).toBe(2);
        expect(res.body.page).toBe(1);
        expect(res.body.totalPages).toBe(1);
    });

    it('calculates skip correctly for page 2 with limit 5', async () => {
        mockPrisma.$transaction.mockImplementation(async queries => {
            return Promise.all(queries.map(q => q));
        });

        // Capture the findMany args
        let capturedSkip;
        mockPrisma.member.findMany = jest.fn().mockImplementation(args => {
            capturedSkip = args.skip;
            return Promise.resolve(members);
        });
        mockPrisma.member.count = jest.fn().mockResolvedValue(10);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/members?page=2&limit=5');

        expect(capturedSkip).toBe(5); // (2-1) * 5
    });

    it('includes search filter across name, email, and psnNumber', async () => {
        let capturedWhere;
        mockPrisma.member.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });
        mockPrisma.member.count = jest.fn().mockResolvedValue(0);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/members?search=Alice');

        expect(capturedWhere.OR).toHaveLength(3);
        const fields = capturedWhere.OR.map(c => Object.keys(c)[0]);
        expect(fields).toContain('fullName');
        expect(fields).toContain('email');
        expect(fields).toContain('psnNumber');
    });

    it('coerces isAdmin query string "true" to boolean true', async () => {
        let capturedWhere;
        mockPrisma.member.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });
        mockPrisma.member.count = jest.fn().mockResolvedValue(0);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/members?isAdmin=true');

        expect(capturedWhere.isAdmin).toBe(true);
    });

    it('coerces isAdmin query string "false" to boolean false', async () => {
        let capturedWhere;
        mockPrisma.member.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });
        mockPrisma.member.count = jest.fn().mockResolvedValue(0);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/members?isAdmin=false');

        expect(capturedWhere.isAdmin).toBe(false);
    });

    it('returns 500 on database failure', async () => {
        mockPrisma.$transaction.mockRejectedValue(new Error('Query error'));

        const res = await request(buildApp()).get('/api/admin/members');

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/admin/reports/:type ───────────────────────────────────────────

describe('POST /api/admin/reports/:type', () => {
    it('calls generateReport with correct type and body params', async () => {
        const { generateReport } = require('../services/reportService');
        generateReport.mockResolvedValue({ rows: 42 });

        const res = await request(buildApp())
            .post('/api/admin/reports/members')
            .send({ startDate: '2024-01-01', endDate: '2024-12-31' });

        expect(res.status).toBe(200);
        expect(generateReport).toHaveBeenCalledWith(
            'members',
            expect.objectContaining({ startDate: '2024-01-01' })
        );
        expect(res.body).toMatchObject({ rows: 42 });
    });

    it('writes an audit log entry after successful report generation', async () => {
        const { generateReport } = require('../services/reportService');
        generateReport.mockResolvedValue({ rows: 0 });

        await request(buildApp()).post('/api/admin/reports/summary').send({});

        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'REPORT_GENERATED' }),
            })
        );
    });

    it('returns 500 when report generation fails', async () => {
        const { generateReport } = require('../services/reportService');
        generateReport.mockRejectedValue(new Error('report error'));

        const res = await request(buildApp()).post('/api/admin/reports/summary').send({});

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/admin/bulk/emails ──────────────────────────────────────────────

describe('POST /api/admin/bulk/emails', () => {
    it('calls sendBulkEmails with the provided parameters', async () => {
        const { sendBulkEmails } = require('../services/emailService');

        const payload = {
            templateType: 'announcement',
            subject: 'Test Subject',
            body: 'Test body',
            members: ['m1', 'm2'],
            sendCopyToAdmin: true,
        };

        const res = await request(buildApp())
            .post('/api/admin/bulk/emails')
            .send(payload);

        expect(res.status).toBe(200);
        expect(sendBulkEmails).toHaveBeenCalledWith(
            expect.objectContaining({
                templateType: 'announcement',
                subject: 'Test Subject',
                members: ['m1', 'm2'],
                sendCopyToAdmin: true,
                senderId: 'admin-user-id',
            })
        );
    });

    it('writes an audit log with member count and sent count', async () => {
        const { sendBulkEmails } = require('../services/emailService');
        sendBulkEmails.mockResolvedValue({ sentCount: 3 });

        await request(buildApp())
            .post('/api/admin/bulk/emails')
            .send({ members: ['a', 'b', 'c'], subject: 'Hi', templateType: 'info' });

        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'BULK_EMAIL_SENT',
                    details: expect.objectContaining({ memberCount: 3 }),
                }),
            })
        );
    });

    it('returns 500 when email service throws', async () => {
        const { sendBulkEmails } = require('../services/emailService');
        sendBulkEmails.mockRejectedValue(new Error('smtp down'));

        const res = await request(buildApp())
            .post('/api/admin/bulk/emails')
            .send({ members: [], subject: 'Test', templateType: 'info' });

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/admin/backup ───────────────────────────────────────────────────

describe('POST /api/admin/backup', () => {
    it('triggers a backup and returns the result', async () => {
        const { createBackup } = require('../services/backupService');

        const res = await request(buildApp()).post('/api/admin/backup');

        expect(res.status).toBe(200);
        expect(createBackup).toHaveBeenCalledWith('admin-user-id');
        expect(res.body).toMatchObject({ id: 'backup-001' });
    });

    it('returns 500 when backup service fails', async () => {
        const { createBackup } = require('../services/backupService');
        createBackup.mockRejectedValue(new Error('S3 unreachable'));

        const res = await request(buildApp()).post('/api/admin/backup');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('S3 unreachable');
    });
});

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────

describe('GET /api/admin/audit-logs', () => {
    it('returns paginated audit logs with user info', async () => {
        const logs = [
            { id: 'log-1', action: 'LOGIN', user: { fullName: 'Alice', psnNumber: 'P1' } },
        ];
        mockPrisma.$transaction.mockResolvedValue([logs, 1]);

        const res = await request(buildApp()).get('/api/admin/audit-logs?page=1&limit=50');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.total).toBe(1);
        expect(res.body.totalPages).toBe(1);
    });

    it('filters by action when provided', async () => {
        let capturedWhere;
        mockPrisma.auditLog.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });
        mockPrisma.auditLog.count = jest.fn().mockResolvedValue(0);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/audit-logs?action=LOGIN');

        expect(capturedWhere.action).toBe('LOGIN');
    });

    it('adds an OR search clause when search param is provided', async () => {
        let capturedWhere;
        mockPrisma.auditLog.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });
        mockPrisma.auditLog.count = jest.fn().mockResolvedValue(0);
        mockPrisma.$transaction.mockImplementation(async queries => Promise.all(queries));

        await request(buildApp()).get('/api/admin/audit-logs?search=Alice');

        expect(capturedWhere.OR).toBeDefined();
        expect(capturedWhere.OR.length).toBeGreaterThan(0);
    });

    it('returns 500 on database error', async () => {
        mockPrisma.$transaction.mockRejectedValue(new Error('DB error'));

        const res = await request(buildApp()).get('/api/admin/audit-logs');

        expect(res.status).toBe(500);
    });
});

// ─── GET /api/admin/monitoring/active-users ───────────────────────────────────

describe('GET /api/admin/monitoring/active-users', () => {
    it('returns the list of users active in the last 15 minutes', async () => {
        const activeUsers = [
            { id: 'u1', fullName: 'Alice', psnNumber: 'P1', lastActivity: new Date(), isAdmin: false },
        ];
        mockPrisma.member.findMany.mockResolvedValue(activeUsers);

        const res = await request(buildApp()).get('/api/admin/monitoring/active-users');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].fullName).toBe('Alice');
    });

    it('filters by isActive:true and lastActivity within 15 minutes', async () => {
        let capturedWhere;
        mockPrisma.member.findMany = jest.fn().mockImplementation(args => {
            capturedWhere = args.where;
            return Promise.resolve([]);
        });

        await request(buildApp()).get('/api/admin/monitoring/active-users');

        expect(capturedWhere.isActive).toBe(true);
        expect(capturedWhere.lastActivity.gte).toBeDefined();
    });

    it('returns 500 on database error', async () => {
        mockPrisma.member.findMany = jest.fn().mockRejectedValue(new Error('query failed'));

        const res = await request(buildApp()).get('/api/admin/monitoring/active-users');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('query failed');
    });
});
