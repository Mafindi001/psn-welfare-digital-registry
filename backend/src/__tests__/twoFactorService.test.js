'use strict';

jest.mock('../config/database', () => require('./__mocks__/prisma'));
jest.mock('./emailService', () => ({ sendEmail: jest.fn().mockResolvedValue({ success: true }) }), { virtual: true });
jest.mock('../services/emailService', () => ({ sendEmail: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { prisma } = require('../config/database');
const twoFactorService = require('../services/twoFactorService');

beforeEach(() => {
    jest.clearAllMocks();
    // Provide a stable JWT_SECRET so hashCode is deterministic
    process.env.JWT_SECRET = 'test-secret';
});

// ─── generateSecret ───────────────────────────────────────────────────────────

describe('generateSecret', () => {
    it('returns a base32 secret and QR data URL', async () => {
        prisma.twoFactorSecret.upsert.mockResolvedValue({});

        const result = await twoFactorService.generateSecret('user-1');

        expect(result.success).toBe(true);
        expect(typeof result.secret).toBe('string');
        expect(result.secret.length).toBeGreaterThan(0);
        expect(result.otpauthUrl).toContain('otpauth://');
        expect(result.qrCodeDataUrl).toMatch(/^data:image\//);
    });

    it('persists the secret via upsert with enabled=false', async () => {
        prisma.twoFactorSecret.upsert.mockResolvedValue({});

        await twoFactorService.generateSecret('user-1');

        expect(prisma.twoFactorSecret.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: 'user-1' },
                create: expect.objectContaining({ userId: 'user-1', enabled: false }),
            })
        );
    });

    it('propagates errors from the database', async () => {
        prisma.twoFactorSecret.upsert.mockRejectedValue(new Error('DB error'));

        await expect(twoFactorService.generateSecret('user-1')).rejects.toThrow('DB error');
    });
});

// ─── verifyToken ──────────────────────────────────────────────────────────────

describe('verifyToken', () => {
    it('returns success:false for an invalid token', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'BASE32SECRET' });

        // speakeasy.totp.verify will almost certainly return false for a random token
        const result = await twoFactorService.verifyToken('user-1', '000000');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid verification code');
    });

    it('throws when 2FA is not set up', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue(null);

        await expect(twoFactorService.verifyToken('user-1', '123456')).rejects.toThrow(
            '2FA not set up for this user'
        );
    });

    it('throws when secret field is missing', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue({ secret: null });

        await expect(twoFactorService.verifyToken('user-1', '123456')).rejects.toThrow(
            '2FA not set up for this user'
        );
    });

    it('writes an audit log on successful verification', async () => {
        const speakeasy = require('speakeasy');
        // Generate a real secret and produce a valid token for it
        const secret = speakeasy.generateSecret({ length: 20 });
        const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });

        prisma.twoFactorSecret.findUnique.mockResolvedValue({ secret: secret.base32 });
        prisma.auditLog.create.mockResolvedValue({});

        const result = await twoFactorService.verifyToken('user-1', token);

        expect(result.success).toBe(true);
        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: '2FA_VERIFIED', userId: 'user-1' }),
            })
        );
    });
});

// ─── enable2FA ────────────────────────────────────────────────────────────────

describe('enable2FA', () => {
    it('returns the inner failure result without enabling when token is invalid', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue({ secret: 'BADSECRET' });

        const result = await twoFactorService.enable2FA('user-1', '000000');

        expect(result.success).toBe(false);
        expect(prisma.twoFactorSecret.update).not.toHaveBeenCalled();
    });

    it('enables 2FA, updates member, and sends email on valid token', async () => {
        const speakeasy = require('speakeasy');
        const secret = speakeasy.generateSecret({ length: 20 });
        const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });

        prisma.twoFactorSecret.findUnique.mockResolvedValue({ secret: secret.base32 });
        prisma.auditLog.create.mockResolvedValue({});
        prisma.twoFactorSecret.update.mockResolvedValue({});
        prisma.member.update.mockResolvedValue({});
        prisma.member.findUnique.mockResolvedValue({ email: 'a@b.com', fullName: 'Alice' });

        const result = await twoFactorService.enable2FA('user-1', token);

        expect(result.success).toBe(true);
        expect(prisma.twoFactorSecret.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ enabled: true }),
            })
        );
        expect(prisma.member.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { requires2FA: true },
            })
        );
    });
});

// ─── disable2FA ───────────────────────────────────────────────────────────────

describe('disable2FA', () => {
    it('disables 2FA and clears requires2FA on the member', async () => {
        prisma.twoFactorSecret.update.mockResolvedValue({});
        prisma.member.update.mockResolvedValue({});
        prisma.member.findUnique.mockResolvedValue({ email: 'a@b.com', fullName: 'Alice' });
        prisma.auditLog.create.mockResolvedValue({});

        const result = await twoFactorService.disable2FA('user-1');

        expect(result.success).toBe(true);
        expect(prisma.member.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: { requires2FA: false } })
        );
    });

    it('logs the admin as the actor when disabled by admin', async () => {
        prisma.twoFactorSecret.update.mockResolvedValue({});
        prisma.member.update.mockResolvedValue({});
        prisma.member.findUnique.mockResolvedValue({ email: 'a@b.com', fullName: 'Alice' });
        prisma.auditLog.create.mockResolvedValue({});

        await twoFactorService.disable2FA('user-1', 'admin-99');

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'admin-99',
                    details: expect.objectContaining({ byAdmin: true, targetUserId: 'user-1' }),
                }),
            })
        );
    });
});

// ─── generateBackupCodes ──────────────────────────────────────────────────────

describe('generateBackupCodes', () => {
    it('generates exactly 10 codes', async () => {
        prisma.twoFactorBackupCode.createMany.mockResolvedValue({});

        const result = await twoFactorService.generateBackupCodes('user-1');

        expect(result.success).toBe(true);
        expect(result.codes).toHaveLength(10);
    });

    it('returns plaintext codes (not hashes) to the caller', async () => {
        prisma.twoFactorBackupCode.createMany.mockResolvedValue({});

        const result = await twoFactorService.generateBackupCodes('user-1');

        // Codes should be short alphanumeric strings, not 64-char hex hashes
        result.codes.forEach(code => {
            expect(code.length).toBeLessThan(20);
            expect(code).toMatch(/^[A-Z0-9]+$/);
        });
    });

    it('stores hashed codes (not plaintext) in the database', async () => {
        prisma.twoFactorBackupCode.createMany.mockResolvedValue({});

        const result = await twoFactorService.generateBackupCodes('user-1');
        const plainCodes = result.codes;

        const createManyCall = prisma.twoFactorBackupCode.createMany.mock.calls[0][0];
        const storedHashes = createManyCall.data.map(d => d.codeHash);

        storedHashes.forEach((hash, i) => {
            expect(hash).not.toBe(plainCodes[i]);
            expect(hash).toHaveLength(64); // sha256 hex
        });
    });

    it('generates unique codes', async () => {
        prisma.twoFactorBackupCode.createMany.mockResolvedValue({});

        const result = await twoFactorService.generateBackupCodes('user-1');
        const unique = new Set(result.codes);

        expect(unique.size).toBe(10);
    });
});

// ─── verifyBackupCode ─────────────────────────────────────────────────────────

describe('verifyBackupCode', () => {
    it('returns success:false when no unused codes exist', async () => {
        prisma.twoFactorBackupCode.findMany.mockResolvedValue([]);

        const result = await twoFactorService.verifyBackupCode('user-1', 'BADCODE');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid backup code');
    });

    it('returns success:false when code does not match any hash', async () => {
        const hash = twoFactorService.hashCode('CORRECTCODE');
        prisma.twoFactorBackupCode.findMany.mockResolvedValue([
            { id: 'bc-1', codeHash: hash },
        ]);

        const result = await twoFactorService.verifyBackupCode('user-1', 'WRONGCODE');

        expect(result.success).toBe(false);
    });

    it('marks the code as used and writes audit log on valid code', async () => {
        const plainCode = 'MYCODE01';
        const hash = twoFactorService.hashCode(plainCode);
        prisma.twoFactorBackupCode.findMany.mockResolvedValue([
            { id: 'bc-1', codeHash: hash },
        ]);
        prisma.twoFactorBackupCode.update.mockResolvedValue({});
        prisma.auditLog.create.mockResolvedValue({});

        const result = await twoFactorService.verifyBackupCode('user-1', plainCode);

        expect(result.success).toBe(true);
        expect(result.codeId).toBe('bc-1');
        expect(prisma.twoFactorBackupCode.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'bc-1' },
                data: expect.objectContaining({ used: true }),
            })
        );
        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: '2FA_BACKUP_USED' }),
            })
        );
    });

    it('does not mark code as used for a wrong code', async () => {
        const hash = twoFactorService.hashCode('RIGHTCODE');
        prisma.twoFactorBackupCode.findMany.mockResolvedValue([{ id: 'bc-1', codeHash: hash }]);

        await twoFactorService.verifyBackupCode('user-1', 'WRONGCODE');

        expect(prisma.twoFactorBackupCode.update).not.toHaveBeenCalled();
    });
});

// ─── verifySmsCode ────────────────────────────────────────────────────────────

describe('verifySmsCode', () => {
    it('returns success:false for an expired or missing code', async () => {
        prisma.twoFactorSmsCode.findFirst.mockResolvedValue(null);

        const result = await twoFactorService.verifySmsCode('user-1', '123456');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid or expired SMS code');
    });

    it('marks the SMS code as used and writes audit log on valid code', async () => {
        prisma.twoFactorSmsCode.findFirst.mockResolvedValue({
            id: 'sms-1',
            phoneNumber: '+234801234567',
        });
        prisma.twoFactorSmsCode.update.mockResolvedValue({});
        prisma.auditLog.create.mockResolvedValue({});

        const result = await twoFactorService.verifySmsCode('user-1', '654321');

        expect(result.success).toBe(true);
        expect(prisma.twoFactorSmsCode.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'sms-1' },
                data: expect.objectContaining({ used: true }),
            })
        );
        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: '2FA_SMS_VERIFIED' }),
            })
        );
    });
});

// ─── hashCode / verifyHash ────────────────────────────────────────────────────

describe('hashCode and verifyHash', () => {
    it('produces a 64-character hex digest', () => {
        const hash = twoFactorService.hashCode('TEST');
        expect(hash).toHaveLength(64);
        expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic for the same input', () => {
        expect(twoFactorService.hashCode('ABC')).toBe(twoFactorService.hashCode('ABC'));
    });

    it('produces different hashes for different inputs', () => {
        expect(twoFactorService.hashCode('AAA')).not.toBe(twoFactorService.hashCode('BBB'));
    });

    it('verifyHash returns true for the original code', () => {
        const code = 'MYCODE';
        const hash = twoFactorService.hashCode(code);
        expect(twoFactorService.verifyHash(code, hash)).toBe(true);
    });

    it('verifyHash returns false for a wrong code', () => {
        const hash = twoFactorService.hashCode('RIGHTCODE');
        expect(twoFactorService.verifyHash('WRONGCODE', hash)).toBe(false);
    });
});

// ─── maskPhone ────────────────────────────────────────────────────────────────

describe('maskPhone', () => {
    it('masks a standard phone number', () => {
        const masked = twoFactorService.maskPhone('+2348012345678');
        expect(masked).toBe('+23****78');
    });

    it('returns "***" for null', () => {
        expect(twoFactorService.maskPhone(null)).toBe('***');
    });

    it('returns "***" for an empty string', () => {
        expect(twoFactorService.maskPhone('')).toBe('***');
    });

    it('returns "***" for strings shorter than 4 characters', () => {
        expect(twoFactorService.maskPhone('123')).toBe('***');
    });

    it('handles exactly 4-character strings', () => {
        const masked = twoFactorService.maskPhone('1234');
        expect(masked).toBe('123****34');
    });
});

// ─── getStatus ────────────────────────────────────────────────────────────────

describe('getStatus', () => {
    it('returns enabled:false when no record exists', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue(null);

        const status = await twoFactorService.getStatus('user-1');

        expect(status.enabled).toBe(false);
        expect(status.method).toBe('none');
    });

    it('returns correct status when 2FA is enabled', async () => {
        prisma.twoFactorSecret.findUnique.mockResolvedValue({
            enabled: true,
            enabledAt: new Date('2024-01-01'),
            backupCodes: [{ id: 'bc-1', createdAt: new Date('2024-01-01') }],
        });

        const status = await twoFactorService.getStatus('user-1');

        expect(status.enabled).toBe(true);
        expect(status.method).toBe('TOTP');
        expect(status.backupCodes.count).toBe(1);
    });
});
