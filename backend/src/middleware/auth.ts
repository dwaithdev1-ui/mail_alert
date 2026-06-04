import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId?: number;
}

/**
 * Token format: "token-{userId}-{timestamp}"
 * Simple, stateless. Replace with JWT in production.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers['authorization'];
  const token  = header?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const parts  = token.split('-');
  const userId = parseInt(parts[1], 10);

  if (parts[0] !== 'token' || isNaN(userId)) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  req.userId = userId;
  next();
}
