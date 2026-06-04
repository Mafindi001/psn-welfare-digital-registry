'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { prisma } = require('../config/database');
const auth = require('../middleware/auth');
const { adminOnly } = require('../middleware/roles');
const { upload, handleUploadError, UPLOAD_DIR } = require('../config/upload');

router.use(auth, adminOnly);

// GET /api/news — paginated list with optional search/filter
router.get('/', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
        const skip = (page - 1) * limit;
        const { status, category, search } = req.query;

        const where = {};
        if (status) where.status = status;
        if (category) where.category = category;
        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { content: { contains: search, mode: 'insensitive' } },
                { excerpt: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [posts, total] = await prisma.$transaction([
            prisma.newsPost.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { author: { select: { id: true, fullName: true } } }
            }),
            prisma.newsPost.count({ where })
        ]);

        res.json({
            posts,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/news/:id — single post
router.get('/:id', async (req, res) => {
    try {
        const post = await prisma.newsPost.findUnique({
            where: { id: req.params.id },
            include: { author: { select: { id: true, fullName: true } } }
        });
        if (!post) return res.status(404).json({ error: 'Post not found' });
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/news — create post with optional cover image
router.post('/', upload.single('coverImage'), handleUploadError, async (req, res) => {
    try {
        const { title, content, excerpt, category, status } = req.body;

        if (!title || !content) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: 'title and content are required' });
        }

        const coverImage = req.file ? `/uploads/news/${req.file.filename}` : null;
        const isPublished = status === 'published';

        const post = await prisma.newsPost.create({
            data: {
                title: title.trim(),
                content,
                excerpt: excerpt ? excerpt.trim() : '',
                category: category || 'general',
                status: isPublished ? 'published' : (status || 'draft'),
                coverImage,
                authorId: req.user.id,
                publishedAt: isPublished ? new Date() : null
            },
            include: { author: { select: { id: true, fullName: true } } }
        });

        res.status(201).json(post);
    } catch (error) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/news/:id — update post, optionally replacing cover image
router.put('/:id', upload.single('coverImage'), handleUploadError, async (req, res) => {
    try {
        const existing = await prisma.newsPost.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            if (req.file) fs.unlink(req.file.path, () => {});
            return res.status(404).json({ error: 'Post not found' });
        }

        const { title, content, excerpt, category, status } = req.body;
        const data = {};

        if (title !== undefined) data.title = title.trim();
        if (content !== undefined) data.content = content;
        if (excerpt !== undefined) data.excerpt = excerpt.trim();
        if (category !== undefined) data.category = category;
        if (status !== undefined) {
            data.status = status;
            if (status === 'published' && !existing.publishedAt) {
                data.publishedAt = new Date();
            }
        }

        if (req.file) {
            data.coverImage = `/uploads/news/${req.file.filename}`;
            if (existing.coverImage) {
                const oldPath = path.join(UPLOAD_DIR, path.basename(existing.coverImage));
                fs.unlink(oldPath, () => {});
            }
        }

        const post = await prisma.newsPost.update({
            where: { id: req.params.id },
            data,
            include: { author: { select: { id: true, fullName: true } } }
        });

        res.json(post);
    } catch (error) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/news/:id — delete post and its cover image
router.delete('/:id', async (req, res) => {
    try {
        const post = await prisma.newsPost.findUnique({ where: { id: req.params.id } });
        if (!post) return res.status(404).json({ error: 'Post not found' });

        if (post.coverImage) {
            const imgPath = path.join(UPLOAD_DIR, path.basename(post.coverImage));
            fs.unlink(imgPath, () => {});
        }

        await prisma.newsPost.delete({ where: { id: req.params.id } });
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/news/:id/image — replace cover image only
router.post('/:id/image', upload.single('coverImage'), handleUploadError, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image provided' });

        const existing = await prisma.newsPost.findUnique({ where: { id: req.params.id } });
        if (!existing) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ error: 'Post not found' });
        }

        if (existing.coverImage) {
            const oldPath = path.join(UPLOAD_DIR, path.basename(existing.coverImage));
            fs.unlink(oldPath, () => {});
        }

        const post = await prisma.newsPost.update({
            where: { id: req.params.id },
            data: { coverImage: `/uploads/news/${req.file.filename}` }
        });

        res.json({ coverImage: post.coverImage });
    } catch (error) {
        if (req.file) fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
