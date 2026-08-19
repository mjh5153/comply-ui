

import {Request, Response} from 'express';
import {forward} from './comply-api.client';

/**
 * Company routes of the COMPLY API (company-controller).
 *
 * The Spring service exposes these at the root, e.g. GET /companies/{id}.
 * The BFF re-publishes them under /api so that a single proxy rule
 * (/api -> BFF) covers every call the Angular client makes.
 *
 *   Angular            BFF                       Spring Boot
 *   /api/companies/1   /api/companies/:id   ->   /companies/1
 */

/**
 * Rejects a non-numeric id before it reaches the upstream service.
 *
 * The OpenAPI contract types id as int64, and Spring answers a malformed id
 * with a 500-level parse failure. Validating here turns that into a clear
 * 400 and saves a pointless network round trip.
 */
function readCompanyId(req: Request, res: Response): string {

    const id = req.params['id'];

    if (!/^\d+$/.test(id)) {
        res.status(400).json({
            status: 400,
            error: 'Bad Request',
            message: "Company id must be a positive integer, received '" + id + "'",
            path: req.originalUrl
        });
        return null;
    }

    return id;
}

/** GET /api/companies -> GET /companies */
export function getAllCompanies(req: Request, res: Response) {
    return forward(req, res, '/companies');
}

/** GET /api/companies/:id -> GET /companies/{id} */
export function getCompany(req: Request, res: Response) {
    const id = readCompanyId(req, res);
    if (id === null) {
        return;
    }
    return forward(req, res, '/companies/' + id);
}

/** POST /api/companies -> POST /companies */
export function createCompany(req: Request, res: Response) {
    return forward(req, res, '/companies');
}

/** PUT /api/companies/:id -> PUT /companies/{id} */
export function updateCompany(req: Request, res: Response) {
    const id = readCompanyId(req, res);
    if (id === null) {
        return;
    }
    return forward(req, res, '/companies/' + id);
}

/** DELETE /api/companies/:id -> DELETE /companies/{id} */
export function deleteCompany(req: Request, res: Response) {
    const id = readCompanyId(req, res);
    if (id === null) {
        return;
    }
    return forward(req, res, '/companies/' + id);
}

/** PUT /api/companies/:id/async -> PUT /companies/{id}/async */
export function updateCompanyAsync(req: Request, res: Response) {
    const id = readCompanyId(req, res);
    if (id === null) {
        return;
    }
    return forward(req, res, '/companies/' + id + '/async');
}

/** POST /api/companies/async -> POST /companies/async */
export function createCompanyAsync(req: Request, res: Response) {
    return forward(req, res, '/companies/async');
}

/** POST /api/companies/batch/async -> POST /companies/batch/async */
export function createCompaniesAsync(req: Request, res: Response) {
    return forward(req, res, '/companies/batch/async');
}
