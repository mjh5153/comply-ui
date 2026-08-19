

import {
    EvaluationResult, FindingDelta, Finding, ProfileModification,
    ProcessingProfile
} from './types';

/**
 * Applies typed modifications to a profile. Only known paths are accepted -
 * a scenario is a structured edit, never free text, so nothing here can be
 * steered by analyst-supplied prose.
 */
export function applyModifications(
    baseline: ProcessingProfile, modifications: ProfileModification[]
): { profile: ProcessingProfile, applied: ProfileModification[], rejected: string[] } {

    const next: ProcessingProfile = JSON.parse(JSON.stringify(baseline));
    const applied: ProfileModification[] = [];
    const rejected: string[] = [];

    const scalarPaths = [
        'retentionDays', 'dataResidency', 'transferMechanism', 'lawfulBasis',
        'processingPurpose', 'dataSubjectLocation', 'dpaExecuted',
        'legitimateInterestAssessment'
    ];

    modifications.forEach(function (mod) {

        if (scalarPaths.indexOf(mod.path) >= 0) {
            applied.push({path: mod.path, from: (next as any)[mod.path], to: mod.to});
            (next as any)[mod.path] = mod.to;
            return;
        }

        // piiElements.<CATEGORY>.treatment - e.g. raw email -> pseudonymized email
        const pii = /^piiElements\.([A-Z_]+)\.treatment$/.exec(mod.path);

        if (pii) {
            const category = pii[1];
            let found = false;
            next.piiElements.forEach(function (element) {
                if (element.category === category) {
                    applied.push({path: mod.path, from: element.treatment, to: mod.to});
                    element.treatment = mod.to;
                    found = true;
                }
            });
            if (!found) {
                rejected.push(mod.path + ' (no such PII element on this profile)');
            }
            return;
        }

        if (mod.path === 'subprocessors') {
            applied.push({path: mod.path, from: next.subprocessors, to: mod.to});
            next.subprocessors = mod.to;
            return;
        }

        rejected.push(mod.path + ' (not a modifiable path)');
    });

    return {profile: next, applied: applied, rejected: rejected};
}

function index(result: EvaluationResult): { [ruleId: string]: Finding } {
    const map: { [ruleId: string]: Finding } = {};
    result.findings.forEach(function (f) { map[f.ruleId] = f; });
    return map;
}

/**
 * The delta is COMPUTED from two engine runs, never narrated by a model.
 * That is what keeps a scenario answer authoritative: the modified result is
 * produced by the same deterministic engine as the baseline.
 */
export function diffResults(
    baseline: EvaluationResult, modified: EvaluationResult
): FindingDelta[] {

    const before = index(baseline);
    const after = index(modified);
    const ruleIds: string[] = [];

    Object.keys(before).forEach(function (id) { ruleIds.push(id); });
    Object.keys(after).forEach(function (id) {
        if (ruleIds.indexOf(id) < 0) { ruleIds.push(id); }
    });

    const deltas: FindingDelta[] = [];

    ruleIds.sort().forEach(function (ruleId) {

        const b = before[ruleId];
        const a = after[ruleId];

        if (!b && a) {
            deltas.push({
                ruleId: ruleId, title: a.title, kind: 'INTRODUCED',
                afterSeverity: a.severity, afterApplicability: a.applicability
            });
            return;
        }

        if (b && !a) {
            deltas.push({
                ruleId: ruleId, title: b.title, kind: 'RESOLVED',
                beforeSeverity: b.severity, beforeApplicability: b.applicability
            });
            return;
        }

        if (b.severity !== a.severity) {
            deltas.push({
                ruleId: ruleId, title: a.title, kind: 'SEVERITY_CHANGED',
                beforeSeverity: b.severity, afterSeverity: a.severity,
                beforeApplicability: b.applicability, afterApplicability: a.applicability
            });
            return;
        }

        if (b.applicability !== a.applicability) {
            deltas.push({
                ruleId: ruleId, title: a.title, kind: 'APPLICABILITY_CHANGED',
                beforeSeverity: b.severity, afterSeverity: a.severity,
                beforeApplicability: b.applicability, afterApplicability: a.applicability
            });
            return;
        }

        deltas.push({
            ruleId: ruleId, title: a.title, kind: 'UNCHANGED',
            beforeSeverity: b.severity, afterSeverity: a.severity,
            beforeApplicability: b.applicability, afterApplicability: a.applicability
        });
    });

    return deltas;
}
