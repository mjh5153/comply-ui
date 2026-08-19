

import {Request, Response} from 'express';
import {engine, explainer} from './compliance';
import {getProfile, putProfile} from './compliance/profile-store';
import {applyModifications, diffResults} from './compliance/scenario';
import {fetchUpstreamJson} from './comply-api.client';
import {ProcessingProfile, Finding} from './compliance/types';

/**
 * Compliance routes.
 *
 * IMPORTANT: unlike /api/companies, these are served BY THE BFF and do not
 * reach the Spring COMPLY API - it exposes no compliance endpoints (verified:
 * /companies/{id}/evaluate answers 404). Every response is labelled
 * provenance.mode = 'fixture' so the UI can say so plainly.
 *
 * The company itself is still authoritative: each route confirms the company
 * exists in Spring before evaluating anything for it.
 */

function readId(req: Request, res: Response): number {
    const raw = req.params['id'];
    if (!/^\d+$/.test(raw)) {
        res.status(400).json({
            status: 400, error: 'Bad Request',
            message: "Company id must be a positive integer, received '" + raw + "'",
            path: req.originalUrl
        });
        return null;
    }
    return parseInt(raw, 10);
}

/** Confirms the company exists upstream; answers and returns false if not. */
async function requireCompany(id: number, req: Request, res: Response): Promise<boolean> {

    const upstream = await fetchUpstreamJson('/companies/' + id);

    if (upstream.status === 0) {
        res.status(502).json({
            status: 502, error: 'Bad Gateway',
            message: 'Could not reach the COMPLY API to confirm company ' + id,
            path: req.originalUrl
        });
        return false;
    }

    if (upstream.status === 404) {
        res.status(404).json({
            status: 404, error: 'Not Found',
            message: 'No company with id ' + id + ' exists in the COMPLY API',
            path: req.originalUrl
        });
        return false;
    }

    return true;
}

/** GET /api/comply/rules - the rule catalogue and its law mappings. */
export async function getRules(req: Request, res: Response) {
    const rules = await engine.describeRules();
    res.json({
        engineMode: engine.mode,
        rules: rules
    });
}

/** GET /api/companies/:id/profile */
export async function getCompanyProfile(req: Request, res: Response) {
    const id = readId(req, res);
    if (id === null) { return; }
    if (!(await requireCompany(id, req, res))) { return; }
    res.json(getProfile(id));
}

/** PUT /api/companies/:id/profile */
export async function putCompanyProfile(req: Request, res: Response) {
    const id = readId(req, res);
    if (id === null) { return; }
    if (!(await requireCompany(id, req, res))) { return; }

    const body = req.body as ProcessingProfile;

    if (!body || typeof body !== 'object') {
        res.status(400).json({
            status: 400, error: 'Bad Request',
            message: 'A processing profile body is required',
            path: req.originalUrl
        });
        return;
    }

    res.json(putProfile(id, body));
}

/** POST /api/companies/:id/evaluate */
export async function evaluateCompany(req: Request, res: Response) {
    const id = readId(req, res);
    if (id === null) { return; }
    if (!(await requireCompany(id, req, res))) { return; }

    // An explicit profile in the body is evaluated without being stored, so a
    // form can preview results before the analyst commits them.
    const profile = (req.body && req.body.retentionDays !== undefined)
        ? putProfileShape(id, req.body)
        : getProfile(id);

    try {
        res.json(await engine.evaluate(profile));
    } catch (error) {
        res.status(503).json({
            status: 503, error: 'Service Unavailable',
            message: (error && error.message) || 'Compliance engine unavailable',
            path: req.originalUrl
        });
    }
}

function putProfileShape(id: number, body: any): ProcessingProfile {
    return {
        companyId: id,
        retentionDays: body.retentionDays,
        dataResidency: body.dataResidency,
        piiElements: body.piiElements || [],
        transferMechanism: body.transferMechanism,
        lawfulBasis: body.lawfulBasis,
        processingPurpose: body.processingPurpose,
        subprocessors: body.subprocessors || [],
        dataSubjectLocation: body.dataSubjectLocation,
        dpaExecuted: body.dpaExecuted,
        legitimateInterestAssessment: body.legitimateInterestAssessment
    };
}

/**
 * POST /api/companies/:id/evaluate/scenario
 *
 * Both sides are produced by the SAME deterministic engine and the delta is
 * computed, not narrated. No model is asked to invent the modified result.
 */
export async function evaluateScenario(req: Request, res: Response) {
    const id = readId(req, res);
    if (id === null) { return; }
    if (!(await requireCompany(id, req, res))) { return; }

    const modifications = (req.body && req.body.modifications) || [];

    if (!Array.isArray(modifications) || modifications.length === 0) {
        res.status(400).json({
            status: 400, error: 'Bad Request',
            message: 'At least one modification is required, e.g. ' +
                     '{"modifications":[{"path":"retentionDays","to":30}]}',
            path: req.originalUrl
        });
        return;
    }

    const baselineProfile = getProfile(id);
    const change = applyModifications(baselineProfile, modifications);

    try {
        const baseline = await engine.evaluate(baselineProfile);
        const modified = await engine.evaluate(change.profile);

        res.json({
            baseline: baseline,
            modified: modified,
            modifications: change.applied,
            rejectedModifications: change.rejected,
            delta: diffResults(baseline, modified),
            provenance: modified.provenance
        });
    } catch (error) {
        res.status(503).json({
            status: 503, error: 'Service Unavailable',
            message: (error && error.message) || 'Compliance engine unavailable',
            path: req.originalUrl
        });
    }
}

/**
 * POST /api/explain
 *
 * Non-authoritative. Returns provenance.source = 'ai'. Receives only the
 * minimum structured context needed, never a whole profile.
 */
export async function explainFinding(req: Request, res: Response) {

    const body = req.body || {};

    if (!body.companyId || !body.ruleId || !body.question) {
        res.status(400).json({
            status: 400, error: 'Bad Request',
            message: 'companyId, ruleId and question are required',
            path: req.originalUrl
        });
        return;
    }

    const result = await engine.evaluate(getProfile(Number(body.companyId)));

    let finding: Finding = null;
    result.findings.forEach(function (f) {
        if (f.ruleId === body.ruleId) { finding = f; }
    });

    if (!finding) {
        res.status(404).json({
            status: 404, error: 'Not Found',
            message: 'No active finding for rule ' + body.ruleId +
                     ' on company ' + body.companyId,
            path: req.originalUrl
        });
        return;
    }

    res.json(await explainer.explain({
        findingId: finding.id,
        ruleId: finding.ruleId,
        question: body.question
    }, finding));
}
