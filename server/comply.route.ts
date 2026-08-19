

import {Request, Response} from 'express';
import {forward} from './comply-api.client';
import {config} from './config';

/**
 * Compliance pipeline routes of the COMPLY API (comply-controller).
 *
 * These already live under /api on the Spring service, so the BFF path and
 * the upstream path are identical and no rewriting is needed.
 */

/** POST /api/comply/process -> POST /api/comply/process */
export function processCompliance(req: Request, res: Response) {
    return forward(req, res, '/api/comply/process');
}

/** POST /api/comply/process/batch -> POST /api/comply/process/batch */
export function processBatchCompliance(req: Request, res: Response) {
    return forward(req, res, '/api/comply/process/batch');
}

/** POST /api/comply/reconcile -> POST /api/comply/reconcile */
export function reconcileResponses(req: Request, res: Response) {
    return forward(req, res, '/api/comply/reconcile');
}

/**
 * POST /api/comply/external-api/concurrent -> same path upstream.
 *
 * The required apiEndpoint query parameter names a URL that the Spring
 * service will then call on the caller's behalf. Once the BFF is reachable
 * from the public internet on Render, forwarding that value unchecked lets
 * an outside caller point the app service at an arbitrary host, including
 * internal addresses on the Render private network.
 *
 * COMPLY_EXTERNAL_API_ALLOWLIST (comma separated URL prefixes) constrains it.
 * When unset the value is forwarded unchanged so local development keeps
 * working, and a warning is logged in production.
 */
export function sendConcurrentApiRequests(req: Request, res: Response) {

    const apiEndpoint = req.query['apiEndpoint'];

    if (!apiEndpoint) {
        res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: "The 'apiEndpoint' query parameter is required",
            path: req.originalUrl
        });
        return;
    }

    const allowlist = (process.env.COMPLY_EXTERNAL_API_ALLOWLIST || '')
        .split(',')
        .map(prefix => prefix.trim())
        .filter(prefix => prefix.length > 0);

    if (allowlist.length === 0) {
        if (config.isProduction) {
            console.warn('[bff] COMPLY_EXTERNAL_API_ALLOWLIST is not set - ' +
                         'apiEndpoint is being forwarded unvalidated');
        }
    } else {
        const target = String(apiEndpoint);
        const permitted = allowlist.some(prefix => target.indexOf(prefix) === 0);

        if (!permitted) {
            console.warn('[bff] blocked apiEndpoint outside allowlist: ' + target);
            res.status(403).json({
                status: 403,
                error: 'Forbidden',
                message: "The requested 'apiEndpoint' is not permitted",
                path: req.originalUrl
            });
            return;
        }
    }

    return forward(req, res, '/api/comply/external-api/concurrent');
}
