import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  id: number;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function generateToken(userId: number, email: string): string {
  return jwt.sign({ id: userId, email }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    req.user = jwt.verify(token, config.jwtSecret) as TokenPayload;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Attaches the user when a valid token is present but lets anonymous requests through.
 * Browsing vocabulary and grammar patterns works logged out; only progress needs an account.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch {
      // An expired token on a public route is not an error, just anonymous.
    }
  }
  next();
}

export function requireUser(req: Request): TokenPayload {
  if (!req.user) throw new Error('requireUser called on an unauthenticated request');
  return req.user;
}
