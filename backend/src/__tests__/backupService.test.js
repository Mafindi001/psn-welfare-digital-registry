'use strict';

// ─── fs mock (must use mock* prefix for jest factory hoisting) ────────────────
// Default resolved values are set here so the BackupService constructor
// (which fires at module-load time) gets back a Promise, not undefined.
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockReaddir = jest.fn().mockResolvedValue([]);
const mockAccess = jest.fn().mockResolvedValue(undefined);
const mockReadFile = jest.fn().mockResolvedValue(Buffer.from('{}'));
const mockStat = jest.fn().mockResolvedValue({ isDirectory: () => false, birthtimeMs: Date.now() });
const mockRm = jest.fn().mockResolvedValue(undefined);

jest.mock('fs', () => ({
    promises: {
        mkdir: mockMkdir,
        writeFile: mockWriteFile,
        readdir: mockReaddir,
        access: mockAccess,
        readFile: mockReadFile,
        stat: mockStat,
        rm: mockRm,
    },
}));

// ─── child_process mock ───────────────────────────────────────────────────────
const mockExec = jest.fn();
jest.mock('child_process', () => ({ exec: mockExec }));

// ─── aws-sdk mock ─────────────────────────────────────────────────────────────
const mockS3UploadPromise = jest.fn();
const mockS3ListPromise = jest.fn();
const mockS3GetPromise = jest.fn();
const mockS3Upload = jest.fn();
const mockS3ListObjects = jest.fn();
const mockS3GetObject = jest.fn();

jest.mock('aws-sdk', () => ({
    config: { update: jest.fn() },
    S3: jest.fn().mockImplementation(() => ({
        upload: mockS3Upload,
        listObjectsV2: mockS3ListObjects,
        getObject: mockS3GetObject,
    })),
}));

jest.mock('../config/database', () => require('./__mocks__/prisma'));
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const { prisma } = require('../config/database');
const backupService = require('../services/backupService');

// Spy on shell/filesystem helper methods so createBackup/restoreBackup can be
// tested as orchestration logic without real I/O.
let spyBackupDatabase;
let spyBackupUploads;
let spyGetFolderSize;
let spyCleanupOldBackups;
let spyRestoreDatabase;
let spyRestoreUploads;
let spyDownloadFromS3;

beforeAll(() => {
    spyBackupDatabase = jest.spyOn(backupService, 'backupDatabase');
    spyBackupUploads = jest.spyOn(backupService, 'backupUploads');
    spyGetFolderSize = jest.spyOn(backupService, 'getFolderSize');
    spyCleanupOldBackups = jest.spyOn(backupService, 'cleanupOldBackups');
    spyRestoreDatabase = jest.spyOn(backupService, 'restoreDatabase');
    spyRestoreUploads = jest.spyOn(backupService, 'restoreUploads');
    spyDownloadFromS3 = jest.spyOn(backupService, 'downloadFromS3');
});

afterAll(() => {
    jest.restoreAllMocks();
});

beforeEach(() => {
    jest.clearAllMocks();

    // exec: returns "1024" as stdout (used by getFolderSize)
    mockExec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: '1024\n', stderr: '' });
    });

    // fs defaults
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReaddir.mockResolvedValue([]);
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(
        Buffer.from(JSON.stringify({ files: { database: 'db.sql', uploads: 'up.tar.gz' } }))
    );
    mockStat.mockResolvedValue({ isDirectory: () => false, birthtimeMs: Date.now() });
    mockRm.mockResolvedValue(undefined);

    // S3 defaults
    mockS3Upload.mockReturnValue({ promise: mockS3UploadPromise });
    mockS3ListObjects.mockReturnValue({ promise: mockS3ListPromise });
    mockS3GetObject.mockReturnValue({ promise: mockS3GetPromise });
    mockS3UploadPromise.mockResolvedValue({});
    mockS3ListPromise.mockResolvedValue({ Contents: [] });
    mockS3GetPromise.mockResolvedValue({ Body: Buffer.from('data') });

    // Spy defaults
    spyBackupDatabase.mockResolvedValue('database-backup.sql');
    spyBackupUploads.mockResolvedValue('uploads-backup.tar.gz');
    spyGetFolderSize.mockResolvedValue(2048);
    spyCleanupOldBackups.mockResolvedValue(undefined);
    spyRestoreDatabase.mockResolvedValue(undefined);
    spyRestoreUploads.mockResolvedValue(undefined);
    spyDownloadFromS3.mockResolvedValue('/tmp/download-backup-001');

    // Prisma defaults
    prisma.backup.create.mockResolvedValue({ id: 'rec-1', backupId: 'backup-001' });
    prisma.backup.findUnique.mockResolvedValue(null);
    prisma.backup.findMany.mockResolvedValue([]);
    prisma.backup.count.mockResolvedValue(5);
    prisma.backup.aggregate.mockResolvedValue({ _sum: { size: 1024 } });
    prisma.backup.findFirst.mockResolvedValue({ createdAt: new Date() });
    prisma.backup.deleteMany.mockResolvedValue({ count: 0 });
    prisma.backup.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});

    // S3 disabled by default — tests that need it enable it explicitly
    backupService.s3 = null;
    backupService.bucketName = null;
});

// ─── formatSize ───────────────────────────────────────────────────────────────

describe('formatSize', () => {
    it('returns "0 Bytes" for 0', () => {
        expect(backupService.formatSize(0)).toBe('0 Bytes');
    });

    it('formats bytes as Bytes', () => {
        expect(backupService.formatSize(512)).toBe('512 Bytes');
    });

    it('formats kilobytes', () => {
        expect(backupService.formatSize(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
        expect(backupService.formatSize(1024 * 1024)).toBe('1 MB');
    });

    it('formats gigabytes', () => {
        expect(backupService.formatSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('rounds to 2 decimal places', () => {
        expect(backupService.formatSize(1536)).toBe('1.5 KB');
    });
});

// ─── getFolderSize ────────────────────────────────────────────────────────────

describe('getFolderSize', () => {
    it('returns parsed integer from du output', async () => {
        spyGetFolderSize.mockRestore();
        mockExec.mockImplementation((cmd, callback) => callback(null, { stdout: '4096\n', stderr: '' }));

        const size = await backupService.getFolderSize('/some/path');

        expect(size).toBe(4096);
        // Re-spy so other tests aren't affected
        spyGetFolderSize = jest.spyOn(backupService, 'getFolderSize').mockResolvedValue(2048);
    });

    it('returns 0 when exec fails', async () => {
        spyGetFolderSize.mockRestore();
        mockExec.mockImplementation((cmd, callback) => callback(new Error('du failed'), null));

        const size = await backupService.getFolderSize('/some/path');

        expect(size).toBe(0);
        spyGetFolderSize = jest.spyOn(backupService, 'getFolderSize').mockResolvedValue(2048);
    });
});

// ─── createBackup ─────────────────────────────────────────────────────────────

describe('createBackup', () => {
    it('returns a success result with backupId and size', async () => {
        const result = await backupService.createBackup('user-1');

        expect(result.success).toBe(true);
        expect(typeof result.backupId).toBe('string');
        expect(result.backupId).toMatch(/^backup-/);
        expect(result.size).toBe(2048);
    });

    it('creates the backup directory', async () => {
        await backupService.createBackup('user-1');
        expect(mockMkdir).toHaveBeenCalled();
    });

    it('calls backupDatabase and backupUploads', async () => {
        await backupService.createBackup('user-1');
        expect(spyBackupDatabase).toHaveBeenCalled();
        expect(spyBackupUploads).toHaveBeenCalled();
    });

    it('writes a metadata.json file', async () => {
        await backupService.createBackup('user-1');
        expect(mockWriteFile).toHaveBeenCalledWith(
            expect.stringContaining('metadata.json'),
            expect.any(String)
        );
    });

    it('records a "completed" backup row in the database', async () => {
        await backupService.createBackup('user-1');
        expect(prisma.backup.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'completed', createdById: 'user-1' }),
            })
        );
    });

    it('does NOT upload to S3 when s3 is not configured', async () => {
        backupService.s3 = null;

        const result = await backupService.createBackup('user-1');

        expect(mockS3Upload).not.toHaveBeenCalled();
        expect(result.s3Location).toBeNull();
    });

    it('uploads to S3 and sets s3Location when S3 is configured', async () => {
        const mockS3 = { upload: mockS3Upload };
        backupService.s3 = mockS3;
        backupService.bucketName = 'my-bucket';
        mockReaddir.mockResolvedValue(['database.sql', 'metadata.json']);
        mockReadFile.mockResolvedValue(Buffer.from('content'));
        mockS3UploadPromise.mockResolvedValue({});

        const result = await backupService.createBackup('user-1');

        expect(result.s3Location).toMatch(/^s3:\/\//);
    });

    it('records a "failed" backup and rethrows on error', async () => {
        spyBackupDatabase.mockRejectedValue(new Error('pg_dump failed'));

        await expect(backupService.createBackup('user-1')).rejects.toThrow('pg_dump failed');

        expect(prisma.backup.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'failed' }),
            })
        );
    });

    it('calls cleanupOldBackups after a successful backup', async () => {
        await backupService.createBackup('user-1');
        expect(spyCleanupOldBackups).toHaveBeenCalled();
    });
});

// ─── restoreBackup ────────────────────────────────────────────────────────────

describe('restoreBackup', () => {
    it('throws when backup record is not found', async () => {
        prisma.backup.findUnique.mockResolvedValue(null);

        await expect(backupService.restoreBackup('backup-missing', 'user-1')).rejects.toThrow(
            'Backup backup-missing not found'
        );
    });

    it('restores from a local path', async () => {
        prisma.backup.findUnique.mockResolvedValue({
            id: 'rec-1',
            backupId: 'backup-001',
            location: 'local:/tmp/backup-001',
        });

        const result = await backupService.restoreBackup('backup-001', 'user-1');

        expect(result.success).toBe(true);
        expect(spyRestoreDatabase).toHaveBeenCalled();
        expect(spyDownloadFromS3).not.toHaveBeenCalled();
    });

    it('downloads from S3 when location starts with s3://', async () => {
        prisma.backup.findUnique.mockResolvedValue({
            id: 'rec-1',
            backupId: 'backup-001',
            location: 's3://my-bucket/backups/backup-001',
        });

        await backupService.restoreBackup('backup-001', 'user-1');

        expect(spyDownloadFromS3).toHaveBeenCalledWith('backup-001');
    });

    it('writes a BACKUP_RESTORED audit log entry', async () => {
        prisma.backup.findUnique.mockResolvedValue({
            id: 'rec-1',
            location: 'local:/tmp/backup-001',
        });

        await backupService.restoreBackup('backup-001', 'admin-1');

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'BACKUP_RESTORED', userId: 'admin-1' }),
            })
        );
    });

    it('writes a BACKUP_RESTORE_FAILED audit log and rethrows on error', async () => {
        prisma.backup.findUnique.mockResolvedValue({
            id: 'rec-1',
            location: 'local:/tmp/backup-001',
        });
        spyRestoreDatabase.mockRejectedValue(new Error('restore failed'));

        await expect(backupService.restoreBackup('backup-001', 'admin-1')).rejects.toThrow();

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ action: 'BACKUP_RESTORE_FAILED' }),
            })
        );
    });
});

// ─── uploadToS3 ───────────────────────────────────────────────────────────────

describe('uploadToS3', () => {
    it('returns null when s3 is not configured', async () => {
        backupService.s3 = null;
        const result = await backupService.uploadToS3('backup-001', '/tmp/path');
        expect(result).toBeNull();
    });

    it('uploads each file and returns the S3 location string', async () => {
        backupService.s3 = { upload: mockS3Upload };
        backupService.bucketName = 'test-bucket';

        mockReaddir.mockResolvedValue(['file1.sql', 'metadata.json']);
        mockReadFile.mockResolvedValue(Buffer.from('content'));
        mockS3UploadPromise.mockResolvedValue({});

        const result = await backupService.uploadToS3('backup-001', '/tmp/path');

        expect(result).toBe('s3://test-bucket/backups/backup-001');
        expect(mockS3Upload).toHaveBeenCalledTimes(2);
    });
});

// ─── cleanupOldBackups ────────────────────────────────────────────────────────

describe('cleanupOldBackups', () => {
    beforeEach(() => {
        spyCleanupOldBackups.mockRestore();
        spyCleanupOldBackups = null;
    });

    afterEach(() => {
        spyCleanupOldBackups = jest.spyOn(backupService, 'cleanupOldBackups').mockResolvedValue(undefined);
    });

    it('deletes backup records beyond the 30-entry limit', async () => {
        const backups = Array.from({ length: 35 }, (_, i) => ({ id: `rec-${i}` }));
        prisma.backup.findMany.mockResolvedValue(backups);
        mockReaddir.mockResolvedValue([]);

        await backupService.cleanupOldBackups();

        expect(prisma.backup.deleteMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: { in: backups.slice(30).map(b => b.id) } },
            })
        );
    });

    it('does not call deleteMany when there are 30 or fewer backups', async () => {
        prisma.backup.findMany.mockResolvedValue(
            Array.from({ length: 30 }, (_, i) => ({ id: `rec-${i}` }))
        );
        mockReaddir.mockResolvedValue([]);

        await backupService.cleanupOldBackups();

        expect(prisma.backup.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes local backup directories older than 7 days', async () => {
        prisma.backup.findMany.mockResolvedValue([]);
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        mockReaddir.mockResolvedValue(['old-backup']);
        mockStat.mockResolvedValue({ isDirectory: () => true, birthtimeMs: eightDaysAgo });

        await backupService.cleanupOldBackups();

        expect(mockRm).toHaveBeenCalled();
    });

    it('skips local directories that are newer than 7 days', async () => {
        prisma.backup.findMany.mockResolvedValue([]);
        mockReaddir.mockResolvedValue(['recent-backup']);
        mockStat.mockResolvedValue({ isDirectory: () => true, birthtimeMs: Date.now() });

        await backupService.cleanupOldBackups();

        expect(mockRm).not.toHaveBeenCalled();
    });
});

// ─── getBackupStats ───────────────────────────────────────────────────────────

describe('getBackupStats', () => {
    it('returns total count, size, and last backup date', async () => {
        prisma.backup.count.mockResolvedValue(10);
        prisma.backup.aggregate.mockResolvedValue({ _sum: { size: 5120 } });
        const lastBackupDate = new Date('2024-01-15');
        prisma.backup.findFirst.mockResolvedValue({ createdAt: lastBackupDate });

        const stats = await backupService.getBackupStats();

        expect(stats.totalBackups).toBe(10);
        expect(stats.totalSize).toBe(5120);
        expect(stats.lastBackup).toEqual(lastBackupDate);
        expect(typeof stats.totalSizeFormatted).toBe('string');
    });

    it('returns totalSize 0 when aggregate sum is null', async () => {
        prisma.backup.count.mockResolvedValue(0);
        prisma.backup.aggregate.mockResolvedValue({ _sum: { size: null } });
        prisma.backup.findFirst.mockResolvedValue(null);

        const stats = await backupService.getBackupStats();

        expect(stats.totalSize).toBe(0);
        expect(stats.lastBackup).toBeUndefined();
    });

    it('returns null on database error', async () => {
        prisma.backup.count.mockRejectedValue(new Error('DB error'));

        const stats = await backupService.getBackupStats();

        expect(stats).toBeNull();
    });
});

// ─── listBackups ──────────────────────────────────────────────────────────────

describe('listBackups', () => {
    it('attaches a human-readable sizeFormatted field to each backup', async () => {
        prisma.backup.findMany.mockResolvedValue([
            { id: 'b-1', size: 1024, createdBy: null, restoredBy: null },
            { id: 'b-2', size: 2048, createdBy: null, restoredBy: null },
        ]);

        const result = await backupService.listBackups();

        expect(result).toHaveLength(2);
        expect(result[0].sizeFormatted).toBe('1 KB');
        expect(result[1].sizeFormatted).toBe('2 KB');
    });

    it('returns an empty array on database error', async () => {
        prisma.backup.findMany.mockRejectedValue(new Error('DB error'));

        const result = await backupService.listBackups();

        expect(result).toEqual([]);
    });
});
