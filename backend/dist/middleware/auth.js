"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
/**
 * Token format: "token-{userId}-{timestamp}"
 * Simple, stateless. Replace with JWT in production.
 */
function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    const token = header?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const parts = token.split('-');
    const userId = parseInt(parts[1], 10);
    if (parts[0] !== 'token' || isNaN(userId)) {
        return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = userId;
    next();
}
