'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');

const router = express.Router();

// All member routes require authentication
router.use(auth);

/**
 * GET /members
 * Paginated list of members. Non-admins see only their own record.
 */
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip = (page - 1) * limit;
        const { search, status } = req.query;

        // Non-admins: return only their own record
        if (!req.user.isAdmin) {
            const member = await prisma.member.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    psnNumber: true,
                    phone: true,
                    isAdmin: true,
                    isActive: true,
                    profilePicture: true,
                    dateOfBirth: true,
                    weddingDate: true,
                    consentGiven: true,
                    lastLogin: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

            return res.status(200).json({
                data: member ? [member] : [],
                total: member ? 1 : 0,
                page: 1,
                totalPages: 1,
            });
        }

        // Admin: build filters
        const where = {};

        if (search) {
            where.OR = [
                { fullName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { psnNumber: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (status === 'active') {
            where.isActive = true;
        } else if (status === 'inactive') {
            where.isActive = false;
        }

        const [members, total] = await Promise.all([
            prisma.member.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    psnNumber: true,
                    phone: true,
                    isAdmin: true,
                    isActive: true,
                    profilePicture: true,
                    dateOfBirth: true,
                    weddingDate: true,
                    consentGiven: true,
                    lastLogin: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.member.count({ where }),
        ]);

        return res.status(200).json({
            data: members,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        logger.error('GET /members error:', err);
        return res.status(500).json({ error: 'Failed to retrieve members' });
    }
});

/**
 * GET /members/:id
 * Get a single member by ID. Non-admins can only access their own record.
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user.isAdmin && req.user.id !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const member = await prisma.member.findUnique({
            where: { id },
            select: {
                id: true,
                fullName: true,
                email: true,
                psnNumber: true,
                phone: true,
                isAdmin: true,
                isActive: true,
                profilePicture: true,
                dateOfBirth: true,
                weddingDate: true,
                consentGiven: true,
                consentDate: true,
                lastLogin: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        return res.status(200).json(member);
    } catch (err) {
        logger.error('GET /members/:id error:', err);
        return res.status(500).json({ error: 'Failed to retrieve member' });
    }
});

/**
 * PUT /members/:id
 * Update allowed profile fields. Non-admins can only update their own record.
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user.isAdmin && req.user.id !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { fullName, phone, profilePicture, dateOfBirth, weddingDate } = req.body;

        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName;
        if (phone !== undefined) updateData.phone = phone;
        if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
        if (weddingDate !== undefined) updateData.weddingDate = weddingDate ? new Date(weddingDate) : null;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided for update' });
        }

        const member = await prisma.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const updated = await prisma.member.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                fullName: true,
                email: true,
                psnNumber: true,
                phone: true,
                isAdmin: true,
                isActive: true,
                profilePicture: true,
                dateOfBirth: true,
                weddingDate: true,
                consentGiven: true,
                lastLogin: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        return res.status(200).json(updated);
    } catch (err) {
        logger.error('PUT /members/:id error:', err);
        return res.status(500).json({ error: 'Failed to update member' });
    }
});

/**
 * PUT /members/:id/password
 * Change password for own account only.
 */
router.put('/:id/password', async (req, res) => {
    try {
        const { id } = req.params;

        // Only the account owner may change their own password
        if (req.user.id !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'currentPassword and newPassword are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters' });
        }

        const member = await prisma.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, member.passwordHash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.member.update({
            where: { id },
            data: { passwordHash },
        });

        return res.status(200).json({ message: 'Password updated successfully' });
    } catch (err) {
        logger.error('PUT /members/:id/password error:', err);
        return res.status(500).json({ error: 'Failed to update password' });
    }
});

/**
 * DELETE /members/:id
 * Admin only — soft-delete (set isActive = false).
 */
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const { id } = req.params;

        const member = await prisma.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        await prisma.member.update({
            where: { id },
            data: { isActive: false },
        });

        logger.info(`Member soft-deleted: ${id} by admin ${req.user.id}`);

        return res.status(200).json({ message: 'Member deactivated successfully' });
    } catch (err) {
        logger.error('DELETE /members/:id error:', err);
        return res.status(500).json({ error: 'Failed to deactivate member' });
    }
});

/**
 * GET /members/:id/special-dates
 * Return all special dates for a member.
 */
router.get('/:id/special-dates', async (req, res) => {
    try {
        const { id } = req.params;

        if (!req.user.isAdmin && req.user.id !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const member = await prisma.member.findUnique({ where: { id } });
        if (!member) {
            return res.status(404).json({ error: 'Member not found' });
        }

        const specialDates = await prisma.specialDate.findMany({
            where: { memberId: id },
            orderBy: { date: 'asc' },
        });

        return res.status(200).json(specialDates);
    } catch (err) {
        logger.error('GET /members/:id/special-dates error:', err);
        return res.status(500).json({ error: 'Failed to retrieve special dates' });
    }
});

module.exports = router;
