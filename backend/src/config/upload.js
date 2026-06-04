'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/news');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uid = crypto.randomBytes(16).toString('hex');
        cb(null, `${Date.now()}-${uid}${ext}`);
    }
});

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

function handleUploadError(err, req, res, next) {
    if (err instanceof multer.MulterError) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
            ? 'File too large. Maximum size is 5MB.'
            : err.message;
        return res.status(400).json({ error: msg });
    }
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
}

module.exports = { upload, handleUploadError, UPLOAD_DIR };
