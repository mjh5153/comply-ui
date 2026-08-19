

import {
    ComplianceEngine, ProcessingProfile, EvaluationResult,
    RuleDescriptor, ProvenanceMode
} from './types';
import {config} from '../config';

/**
 * ComplianceEngine backed by the Spring COMPLY API.
 *
 * The Spring service does not expose compliance endpoints today - /companies
 * and /api/comply/* are company CRUD and async plumbing, and the OpenAPI
 * document declares exactly one schema, CompanyDTO. Verified against the
 * running service: /companies/{id}/evaluate answers 404.
 *
 * This class is therefore the seam, not a working client. When Spring grows
 * the endpoints, fill in the two methods below and set COMPLY_ENGINE_MODE=live.
 * Nothing in Angular changes: the wire contract and the route paths stay
 * identical, and only `mode` in each Provenance flips from fixture to live.
 */
export class UpstreamComplianceEngine implements ComplianceEngine {

    mode: ProvenanceMode = 'live';

    private notImplemented(): Error {
        return new Error(
            'COMPLY_ENGINE_MODE=live, but the COMPLY API at ' + config.complyApiBaseUrl +
            ' exposes no compliance evaluation endpoints. Set COMPLY_ENGINE_MODE=fixture ' +
            'or implement UpstreamComplianceEngine against the new Spring routes.');
    }

    evaluate(profile: ProcessingProfile): Promise<EvaluationResult> {
        return Promise.reject(this.notImplemented());
    }

    describeRules(): Promise<RuleDescriptor[]> {
        return Promise.reject(this.notImplemented());
    }
}
