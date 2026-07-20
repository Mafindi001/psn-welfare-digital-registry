'use strict';

const mockConnect = jest.fn();
const mockMemberFindUnique = jest.fn();
const mockMemberCreate = jest.fn();

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn().mockImplementation(() => ({
        $connect: mockConnect,
        $disconnect: jest.fn(),
        member: {
            findUnique: mockMemberFindUnique,
            create: mockMemberCreate,
        },
    })),
}));

jest.mock('bcryptjs', () => ({
    hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// Load module once after mocks are registered
const { testConnection, ensureAdminUser } = require('../config/database');

beforeEach(() => {
    jest.clearAllMocks();
    // Default happy-path behaviour; individual tests override as needed
    mockConnect.mockResolvedValue(undefined);
    mockMemberFindUnique.mockResolvedValue(null);
    mockMemberCreate.mockResolvedValue({});
});

// ─── testConnection ───────────────────────────────────────────────────────────

describe('testConnection', () => {
    it('returns true on successful connection', async () => {
        // Admin already exists so no create path is triggered
        process.env.DEFAULT_ADMIN_EMAIL = 'admin@test.com';
        process.env.DEFAULT_ADMIN_PSN = 'PSN001';
        mockMemberFindUnique.mockResolvedValue({ id: 'existing-admin' });

        const result = await testConnection();

        expect(result).toBe(true);
        expect(mockConnect).toHaveBeenCalled();
    });

    it('returns false when $connect rejects', async () => {
        mockConnect.mockRejectedValue(new Error('Connection refused'));

        const result = await testConnection();

        expect(result).toBe(false);
    });
});

// ─── ensureAdminUser ──────────────────────────────────────────────────────────

describe('ensureAdminUser', () => {
    beforeEach(() => {
        process.env.DEFAULT_ADMIN_EMAIL = 'admin@psn.org';
        process.env.DEFAULT_ADMIN_PSN = 'PSN-ADMIN-001';
        process.env.DEFAULT_ADMIN_PASSWORD = 'SecurePass123!';
    });

    afterEach(() => {
        delete process.env.DEFAULT_ADMIN_EMAIL;
        delete process.env.DEFAULT_ADMIN_PSN;
        delete process.env.DEFAULT_ADMIN_PASSWORD;
    });

    it('creates an admin user when none exists', async () => {
        mockMemberFindUnique.mockResolvedValue(null);
        mockMemberCreate.mockResolvedValue({ id: 'new-admin' });

        await ensureAdminUser();

        expect(mockMemberCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    email: 'admin@psn.org',
                    psnNumber: 'PSN-ADMIN-001',
                    isAdmin: true,
                    consentGiven: true,
                    isActive: true,
                }),
            })
        );
    });

    it('does NOT create an admin user when one already exists', async () => {
        mockMemberFindUnique.mockResolvedValue({ id: 'existing-admin' });

        await ensureAdminUser();

        expect(mockMemberCreate).not.toHaveBeenCalled();
    });

    it('does nothing when DEFAULT_ADMIN_EMAIL is missing', async () => {
        delete process.env.DEFAULT_ADMIN_EMAIL;

        await ensureAdminUser();

        expect(mockMemberFindUnique).not.toHaveBeenCalled();
        expect(mockMemberCreate).not.toHaveBeenCalled();
    });

    it('does nothing when DEFAULT_ADMIN_PSN is missing', async () => {
        delete process.env.DEFAULT_ADMIN_PSN;

        await ensureAdminUser();

        expect(mockMemberFindUnique).not.toHaveBeenCalled();
        expect(mockMemberCreate).not.toHaveBeenCalled();
    });

    it('stores a bcrypt hash, not the plaintext password', async () => {
        mockMemberFindUnique.mockResolvedValue(null);
        mockMemberCreate.mockResolvedValue({});

        await ensureAdminUser();

        const createCall = mockMemberCreate.mock.calls[0][0];
        expect(createCall.data.passwordHash).toBe('hashed-password');
        expect(createCall.data.passwordHash).not.toBe('SecurePass123!');
    });

    it('looks up admin by email address', async () => {
        mockMemberFindUnique.mockResolvedValue({ id: 'admin' });

        await ensureAdminUser();

        expect(mockMemberFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { email: 'admin@psn.org' },
            })
        );
    });
});
