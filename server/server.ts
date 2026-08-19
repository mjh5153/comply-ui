

import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {Application, Request, Response} from "express";
import {config, describeConfig} from './config';
import {probeUpstream} from './comply-api.client';
import {
    getAllCompanies,
    getCompany,
    createCompany,
    updateCompany,
    deleteCompany,
    updateCompanyAsync,
    createCompanyAsync,
    createCompaniesAsync
} from './companies.route';
import {
    processCompliance,
    processBatchCompliance,
    reconcileResponses,
    sendConcurrentApiRequests
} from './comply.route';
import {
    getRules,
    getCompanyProfile,
    putCompanyProfile,
    evaluateCompany,
    evaluateScenario,
    explainFinding
} from './compliance.route';
import {describeEngineConfig} from './compliance';

const app: Application = express();

const cors = require('cors');

/**
 * CORS.
 *
 * Locally the Angular dev server proxies /api into this process, so requests
 * arrive same-origin and this never fires. It matters in production, where
 * the browser loads the app from the Render web service and calls the BFF on
 * a different origin. Origins come from CORS_ALLOWED_ORIGINS; '*' disables
 * the check entirely and should only be used for throwaway environments.
 */
app.use(cors({
    origin: function (origin, callback) {

        // Same-origin requests and server-to-server calls send no Origin header.
        if (!origin) {
            return callback(null, true);
        }

        if (config.corsAllowedOrigins.indexOf('*') >= 0) {
            return callback(null, true);
        }

        if (config.corsAllowedOrigins.indexOf(origin) >= 0) {
            return callback(null, true);
        }

        console.warn('[bff] blocked cross-origin request from ' + origin);
        return callback(null, false);
    },
    credentials: true
}));

// Required for the COMPLY API routes: without a JSON body parser every
// forwarded POST and PUT would reach Spring with an empty payload.
app.use(express.json({limit: '1mb'}));


// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Readiness probe for the Render web service. Reports whether the BFF can
 * currently reach the Spring app service, which is the failure most likely
 * to occur in the split deployment.
 */
app.route('/api/health').get(async (req: Request, res: Response) => {
    const upstream = await probeUpstream();
    res.status(upstream.reachable ? 200 : 503).json({
        status: upstream.reachable ? 'ok' : 'degraded',
        complyApiBaseUrl: config.complyApiBaseUrl,
        upstream: upstream
    });
});


// ---------------------------------------------------------------------------
// COMPLY API - company-controller
//
// Literal paths are registered before the /:id patterns so that they are not
// captured as an id.
// ---------------------------------------------------------------------------

app.route('/api/companies').get(getAllCompanies);

app.route('/api/companies').post(createCompany);

app.route('/api/companies/async').post(createCompanyAsync);

app.route('/api/companies/batch/async').post(createCompaniesAsync);

app.route('/api/companies/:id/async').put(updateCompanyAsync);

app.route('/api/companies/:id').get(getCompany);

app.route('/api/companies/:id').put(updateCompany);

app.route('/api/companies/:id').delete(deleteCompany);


// ---------------------------------------------------------------------------
// COMPLY API - comply-controller
// ---------------------------------------------------------------------------

app.route('/api/comply/process').post(processCompliance);

app.route('/api/comply/process/batch').post(processBatchCompliance);

app.route('/api/comply/reconcile').post(reconcileResponses);

app.route('/api/comply/external-api/concurrent').post(sendConcurrentApiRequests);


// ---------------------------------------------------------------------------
// Compliance engine
//
// Served BY THIS PROCESS, not proxied. The Spring COMPLY API exposes no
// compliance endpoints - its OpenAPI document declares one schema, CompanyDTO,
// and /companies/{id}/evaluate answers 404. Every response below carries
// provenance.mode = 'fixture' so the UI never presents these as COMPLY engine
// output. Set COMPLY_ENGINE_MODE=live once Spring implements them.
// ---------------------------------------------------------------------------

app.route('/api/comply/rules').get(getRules);

app.route('/api/companies/:id/profile').get(getCompanyProfile);

app.route('/api/companies/:id/profile').put(putCompanyProfile);

app.route('/api/companies/:id/evaluate').post(evaluateCompany);

app.route('/api/companies/:id/evaluate/scenario').post(evaluateScenario);

app.route('/api/explain').post(explainFinding);


// ---------------------------------------------------------------------------
// Fallback
// ---------------------------------------------------------------------------

// A JSON 404 for unmatched /api paths, so the Angular client always receives
// a parseable body instead of Express's default HTML error page.
app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
        status: 404,
        error: 'Not Found',
        message: 'No BFF route matches ' + req.method + ' ' + req.originalUrl,
        path: req.originalUrl
    });
});

// ---------------------------------------------------------------------------
// Static Angular app (production only)
//
// When a build is present this process serves the compiled UI as well as the
// API. That keeps the browser on a single origin in production, so CORS never
// applies and the frontend can keep using relative /api paths.
//
// On Render this is the "web" service; the Spring Boot API is the separate
// "app" service reached via COMPLY_API_BASE_URL. In local development the
// directory does not exist, this block is skipped, and `ng serve` serves the
// UI instead.
// ---------------------------------------------------------------------------

function findBuildOutput(): string {

    const candidates = [
        path.join(__dirname, '..', 'dist', 'browser'),
        path.join(__dirname, '..', 'dist')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'index.html'))) {
            return candidate;
        }
    }

    return null;
}

const buildOutput = findBuildOutput();

if (buildOutput) {

    console.log('Serving Angular build from ' + buildOutput);

    app.use(express.static(buildOutput));

    // Deep links such as /companies/1 are client-side routes with no file on
    // disk, so anything not matched above falls back to index.html.
    app.use((req: Request, res: Response) => {
        res.sendFile(path.join(buildOutput, 'index.html'));
    });

} else {
    console.log('No Angular build found in dist/ - API only (run `npm start` for the UI)');
}

const httpServer: any = app.listen(config.port, () => {
    console.log("HTTP REST API Server running at http://localhost:" + httpServer.address().port);
    console.log("Proxying COMPLY API requests with:");
    console.log(describeConfig());
    console.log("Compliance engine configuration:");
    console.log(describeEngineConfig());
});
