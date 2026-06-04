// Shared Prisma mock — import this in each test file:
//   jest.mock('../../config/database', () => require('./__mocks__/prisma'));

const prisma = {
    twoFactorSecret: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
    },
    twoFactorBackupCode: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
    },
    twoFactorSmsCode: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
    },
    auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
    },
    member: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
    },
    ipWhitelist: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
    },
    specialDate: { count: jest.fn() },
    reminderLog: { count: jest.fn() },
    backup: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
};

module.exports = { prisma };
