import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface ServiceAuthPayload {
    service: string;
    iat: number;
    exp: number;
}

/**
 * Generates a service-to-service JWT token.
 * Tokens are short-lived (5 minutes) for security.
 */
export function generateServiceToken(serviceName: string): string {
    const secret = process.env.SERVICE_JWT_SECRET;
    if (!secret) {
        throw new Error('SERVICE_JWT_SECRET is not configured');
    }
    return jwt.sign({ service: serviceName }, secret, { expiresIn: '5m' });
}

/**
 * Express middleware that validates service-to-service JWT tokens.
 * Rejects requests from unauthorized services.
 */
export function serviceAuthMiddleware(allowedServices: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const secret = process.env.SERVICE_JWT_SECRET;
        if (!secret) {
            logger.error('SERVICE_JWT_SECRET is not configured');
            res.status(500).json({ error: 'Internal Server Error: Auth configuration missing' });
            return;
        }

        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.warn({ path: req.path }, 'Missing or invalid Authorization header');
            res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
            return;
        }

        const token = authHeader.slice(7);

        try {
            const decoded = jwt.verify(token, secret) as ServiceAuthPayload;

            if (!allowedServices.includes(decoded.service)) {
                logger.warn(
                    { service: decoded.service, path: req.path },
                    'Service not authorized for this endpoint'
                );
                res.status(403).json({ error: 'Forbidden: Service not authorized' });
                return;
            }

            // Attach service identity to request
            (req as Request & { serviceIdentity?: string }).serviceIdentity = decoded.service;
            next();
        } catch (err) {
            logger.warn({ error: (err as Error).message, path: req.path }, 'JWT verification failed');
            res.status(401).json({ error: 'Unauthorized: Invalid token' });
            return;
        }
    };
}
