

import {createHash} from 'crypto';
import {
    ComplianceEngine, ProcessingProfile, EvaluationResult, Finding,
    Provenance, RuleDescriptor, ProvenanceMode
} from './types';
import {RULES, RULE_SET_VERSION, deriveApplicability} from './rules';

export const ENGINE_VERSION = 'fixture-1.0.0';

/**
 * Deterministic fixture implementation of ComplianceEngine.
 *
 * Determinism is the whole point, not an implementation detail. The trust
 * boundary rests on "engine results are reproducible, AI explanations are not",
 * and the scenario feature is only meaningful if changing an input actually
 * changes the output. Every finding here is a pure function of the profile.
 *
 * This runs entirely inside the BFF. It never contacts the Spring COMPLY API,
 * which has no compliance endpoints - see UpstreamComplianceEngine.
 */
export class FixtureComplianceEngine implements ComplianceEngine {

    mode: ProvenanceMode = 'fixture';

    private provenance(): Provenance {
        return {
            source: 'engine',
            mode: this.mode,
            producedAt: new Date().toISOString(),
            engineVersion: ENGINE_VERSION,
            ruleSetVersion: RULE_SET_VERSION
        };
    }

    /** Stable across runs so a finding can be referenced between requests. */
    private findingId(ruleId: string, companyId: number): string {
        return createHash('sha1')
            .update(ruleId + ':' + companyId)
            .digest('hex')
            .substring(0, 12);
    }

    evaluate(profile: ProcessingProfile): Promise<EvaluationResult> {

        const self = this;
        const findings: Finding[] = [];

        RULES.forEach(function (rule) {

            const outcome = rule.evaluate(profile);

            if (!outcome.fires) {
                return;
            }

            const derived = deriveApplicability(rule, profile, outcome);

            findings.push({
                id: self.findingId(rule.descriptor.id, profile.companyId),
                ruleId: rule.descriptor.id,
                severity: outcome.severity || rule.descriptor.severity,
                applicability: derived.applicability,
                title: rule.descriptor.title,
                rationale: outcome.rationale,
                lawMappings: rule.descriptor.lawMappings,
                triggeringFacts: outcome.triggeringFacts,
                recommendedControls: outcome.recommendedControls,
                missingInformation: derived.missingInformation,
                assumptions: outcome.assumptions,
                provenance: self.provenance()
            });
        });

        const order: { [k: string]: number } = {CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3};

        findings.sort(function (a, b) {
            const bySeverity = order[a.severity] - order[b.severity];
            return bySeverity !== 0 ? bySeverity : a.ruleId.localeCompare(b.ruleId);
        });

        return Promise.resolve({
            companyId: profile.companyId,
            profile: profile,
            findings: findings,
            provenance: this.provenance()
        });
    }

    describeRules(): Promise<RuleDescriptor[]> {
        return Promise.resolve(RULES.map(function (r) { return r.descriptor; }));
    }
}
