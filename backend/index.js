require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const http = require('http');
const { WebSocketServer } = require('ws');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const adminRoutes = require('./routes/admin');
const reportRoutes = require('./routes/reports');
const backupRoutes = require('./routes/backup');
const auditRoutes = require('./routes/audit');
const newsRoutes = require('./src/routes/news');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const { setupWebSocket } = require('./services/websocketService');

// Initialize app
const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            services: {
                email: process.env.SMTP_HOST ? 'configured' : 'not configured',
                backup: process.env.AWS_S3_BUCKET ? 'configured' : 'not configured'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message,
            database: 'disconnected'
        });
    }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/news', newsRoutes);

// Static files for reports and uploads
app.use('/reports', express.static('reports'));
app.use('/uploads', express.static('uploads'));

// Error handling
app.use(notFound);
app.use(errorHandler);

// Setup WebSocket server
const wss = setupWebSocket(server);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    logger.info(`PSN Welfare Registry Backend running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Database: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Starting graceful shutdown...');
    await prisma.$disconnect();
    wss.close();
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, prisma };