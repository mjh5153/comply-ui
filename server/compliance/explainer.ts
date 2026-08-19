

import {Finding, Provenance, ProvenanceMode} from './types';

/**
 * AI explanation seam.
 *
 * Per the project's AI Integration Boundary: no production AI endpoint is
 * invented here. This is the interface a real provider plugs into later,
 * with a clearly labelled fixture implementation behind it for now.
 *
 * Everything this layer returns carries source: 'ai'. It is never authoritative
 * and must never overwrite a field the engine produced.
 */

export interface FindingsExplanationRequest {
    findingId: string;
    ruleId: string;
    question: ExplanationQuestion;
}

export type ExplanationQuestion =
    'WHY_PRODUCED' | 'TRIGGERING_FACTS' | 'MISSING_INFORMATION' |
    'WHY_APPLICABILITY' | 'RECOMMENDED_CONTROLS' | 'PLAIN_LANGUAGE';

export interface FindingsExplanation {
    findingId: string;
    question: ExplanationQuestion;
    text: string;
    groundedIn: string[];
    provenance: Provenance;
}

export interface FindingsExplanationProvider {
    mode: ProvenanceMode;
    explain(request: FindingsExplanationRequest, finding: Finding): Promise<FindingsExplanation>;
}

/**
 * Strips characters that would let free text in a profile - a subprocessor
 * name, a processing purpose - read as instructions once this context is
 * handed to a real model. All scan input is untrusted; neutralising it here
 * means the defence is already in place when a live provider replaces this.
 */
function untrusted(value: string): string {
    return String(value)
        .replace(/[\r\n]+/g, ' ')
        .replace(/[`<>{}\[\]]/g, '')
        .substring(0, 200);
}

/**
 * Deterministic fixture explainer.
 *
 * It restates structured engine output in plain language and does nothing
 * else. It cannot reach a conclusion the engine did not already produce,
 * which is exactly the property a real provider will NOT have - hence the
 * provenance labelling and the groundedIn list.
 */
export class FixtureExplanationProvider implements FindingsExplanationProvider {

    mode: ProvenanceMode = 'fixture';

    private provenance(): Provenance {
        return {
            source: 'ai',
            mode: this.mode,
            producedAt: new Date().toISOString()
        };
    }

    explain(request: FindingsExplanationRequest, finding: Finding): Promise<FindingsExplanation> {

        let text: string;
        const grounded: string[] = [];

        switch (request.question) {

            case 'TRIGGERING_FACTS':
                text = finding.triggeringFacts.length === 0
                    ? 'The engine recorded no specific triggering facts for this finding.'
                    : 'This finding was produced because ' +
                      finding.triggeringFacts.map(function (f) {
                          return untrusted(f.path) + ' is ' + untrusted(String(f.value)) +
                              (f.threshold !== undefined
                                  ? ' (' + f.operator + ' ' + untrusted(String(f.threshold)) + ')'
                                  : '');
                      }).join('; ') + '.';
                grounded.push('finding.triggeringFacts');
                break;

            case 'MISSING_INFORMATION':
                text = finding.missingInformation.length === 0
                    ? 'Every fact this rule requires is present on the profile, so the ' +
                      'finding is confirmed rather than provisional.'
                    : 'The profile does not record ' +
                      finding.missingInformation.join(', ') +
                      '. Supplying these would let the engine settle the applicability.';
                grounded.push('finding.missingInformation');
                break;

            case 'WHY_APPLICABILITY':
                if (finding.applicability === 'CONFIRMED') {
                    text = 'Applicability is CONFIRMED because the rule fired and every ' +
                           'required fact is recorded on the profile.';
                } else if (finding.applicability === 'POSSIBLE') {
                    text = 'Applicability is POSSIBLE because the rule only fires under a ' +
                           'stated assumption: ' + finding.assumptions.join(' ') +
                           ' The engine will not assert what it cannot confirm.';
                } else {
                    text = 'Applicability is LIKELY rather than CONFIRMED because the ' +
                           'rule fired but the profile is missing ' +
                           finding.missingInformation.join(', ') + '.';
                }
                grounded.push('finding.applicability', 'finding.missingInformation', 'finding.assumptions');
                break;

            case 'RECOMMENDED_CONTROLS':
                text = 'The engine associates ' + finding.recommendedControls.length +
                       ' control(s) with this rule: ' +
                       finding.recommendedControls.join('; ') + '.';
                grounded.push('finding.recommendedControls');
                break;

            case 'PLAIN_LANGUAGE':
                text = finding.title + '. ' + finding.rationale +
                       ' This maps to ' +
                       finding.lawMappings.map(function (m) {
                           return m.framework + ' ' + m.citation;
                       }).join(' and ') + '.';
                grounded.push('finding.title', 'finding.rationale', 'finding.lawMappings');
                break;

            case 'WHY_PRODUCED':
            default:
                text = 'Rule ' + finding.ruleId + ' fired against this profile. ' +
                       finding.rationale;
                grounded.push('finding.ruleId', 'finding.rationale');
                break;
        }

        return Promise.resolve({
            findingId: finding.id,
            question: request.question,
            text: text,
            groundedIn: grounded,
            provenance: this.provenance()
        });
    }
}
