'use strict';

/**
 * Passes if req.user.isAdmin === true, otherwise returns 403.
 */
function adminOnly(req, res, next) {
    if (req.user && req.user.isAdmin === true) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
}

/**
 * Passes if the user is a Super Administrator OR an admin with user_management permission.
 * Otherwise returns 403.
 */
function superAdminOnly(req, res, next) {
    if (!req.user) {
        return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
    }

    const isSuperAdmin = req.user.role === 'Super Administrator';
    const isAdminWithPermission =
        req.user.isAdmin === true &&
        Array.isArray(req.user.permissions) &&
        req.user.permissions.includes('user_management');

    if (isSuperAdmin || isAdminWithPermission) {
        return next();
    }

    return res.status(403).json({ error: 'Access denied. Super Administrator privileges required.' });
}

module.exports = { adminOnly, superAdminOnly };
