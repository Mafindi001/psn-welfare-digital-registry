'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const logger = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '24h';

/**
 * Sign a JWT for the given member payload.
 */
function signToken(member) {
    return jwt.sign(
        { id: member.id, email: member.email, isAdmin: member.isAdmin },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

/**
 * POST /auth/register
 * Create a new member account.
 */
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, psnNumber, phone, password, consentGiven } = req.body;

        // Validate required fields
        if (!fullName || !email || !psnNumber || !phone || !password || !consentGiven) {
            return res.status(400).json({
                error: 'All fields are required: fullName, email, psnNumber, phone, password, consentGiven',
            });
        }

        // Check for duplicate email or PSN number
        const existing = await prisma.member.findFirst({
            where: {
                OR: [{ email }, { psnNumber }],
            },
        });

        if (existing) {
            const field = existing.email === email ? 'email' : 'PSN number';
            return res.status(409).json({ error: `A member with this ${field} already exists` });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const member = await prisma.member.create({
            data: {
                fullName,
                email,
                psnNumber,
                phone,
                passwordHash,
                consentGiven: Boolean(consentGiven),
                consentDate: new Date(),
                isActive: true,
            },
        });

        const token = signToken(member);

        const { passwordHash: _pw, ...userOut } = member;

        logger.info(`New member registered: ${email}`);

        return res.status(201).json({ user: userOut, token });
    } catch (err) {
        logger.error('POST /auth/register error:', err);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /auth/login
 * Authenticate a member and return a JWT.
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const member = await prisma.member.findUnique({ where: { email } });

        if (!member) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const passwordMatch = await bcrypt.compare(password, member.passwordHash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!member.isActive) {
            return res.status(401).json({ error: 'Account is deactivated. Please contact an administrator.' });
        }

        // Update lastLogin timestamp
        await prisma.member.update({
            where: { id: member.id },
            data: { lastLogin: new Date() },
        });

        const token = signToken(member);

        const { passwordHash: _pw, ...userOut } = member;
        userOut.password = undefined;

        logger.info(`Member logged in: ${email}`);

        return res.status(200).json({ user: userOut, token });
    } catch (err) {
        logger.error('POST /auth/login error:', err);
        return res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /auth/logout
 * Stateless JWT logout — client discards token.
 */
router.post('/logout', (req, res) => {
    return res.status(200).json({ message: 'Logged out successfully' });
});

/**
 * POST /auth/refresh
 * Verify existing JWT and issue a new one.
 */
router.post('/refresh', (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        const newToken = jwt.sign(
            { id: decoded.id, email: decoded.email, isAdmin: decoded.isAdmin },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
        );

        return res.status(200).json({ token: newToken });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
});

/**
 * GET /auth/me
 * Return the currently authenticated member's profile.
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
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
        logger.error('GET /auth/me error:', err);
        return res.status(500).json({ error: 'Failed to retrieve profile' });
    }
});

module.exports = router;
