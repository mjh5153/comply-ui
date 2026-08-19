

import {describe, it, expect} from 'vitest';
import {FixtureComplianceEngine} from './fixture-engine';
import {applyModifications, diffResults} from './scenario';
import {seedProfile} from './profile-store';
import {ProcessingProfile} from './types';

const engine = new FixtureComplianceEngine();

function profile(overrides: Partial<ProcessingProfile> = {}): ProcessingProfile {
    return {
        companyId: 1,
        retentionDays: 30,
        dataResidency: 'DE',
        piiElements: [{category: 'EMAIL', treatment: 'PSEUDONYMIZED'}],
        transferMechanism: 'NONE',
        lawfulBasis: 'CONSENT',
        processingPurpose: 'SERVICE_DELIVERY',
        subprocessors: [],
        ...overrides
    };
}

function ruleIds(findings: {ruleId: string}[]): string[] {
    return findings.map(f => f.ruleId).sort();
}

describe('determinism', () => {

    it('produces identical findings for identical input', async () => {
        const p = profile({retentionDays: 900, processingPurpose: 'MARKETING'});
        const a = await engine.evaluate(p);
        const b = await engine.evaluate(p);

        // producedAt is a timestamp, so compare everything else.
        expect(JSON.stringify(a.findings.map(f => ({...f, provenance: null}))))
            .toEqual(JSON.stringify(b.findings.map(f => ({...f, provenance: null}))));
    });

    it('seeds the same profile for a company id across restarts', () => {
        expect(seedProfile(7)).toEqual(seedProfile(7));
        expect(seedProfile(7)).not.toEqual(seedProfile(8));
    });

    it('gives a finding a stable id', async () => {
        const a = await engine.evaluate(profile({retentionDays: 900, processingPurpose: 'MARKETING'}));
        const b = await engine.evaluate(profile({retentionDays: 900, processingPurpose: 'MARKETING'}));
        expect(a.findings[0].id).toEqual(b.findings[0].id);
    });
});

describe('applicability is derived from fact completeness', () => {

    it('is CONFIRMED when every required fact is present', async () => {
        const r = await engine.evaluate(profile({retentionDays: 900, processingPurpose: 'MARKETING'}));
        const ret = r.findings.find(f => f.ruleId === 'RET-001');
        expect(ret!.applicability).toBe('CONFIRMED');
        expect(ret!.missingInformation).toEqual([]);
    });

    it('is POSSIBLE when the rule fires only under a stated assumption', async () => {
        const r = await engine.evaluate(profile({
            dataResidency: 'US', transferMechanism: 'NONE'
        }));
        const xfer = r.findings.find(f => f.ruleId === 'XFER-001');
        expect(xfer!.applicability).toBe('POSSIBLE');
        expect(xfer!.assumptions.length).toBeGreaterThan(0);
    });

    it('will not fire the transfer rule when subjects are outside the EEA', async () => {
        const r = await engine.evaluate(profile({
            dataResidency: 'US', transferMechanism: 'NONE', dataSubjectLocation: 'BR'
        }));
        expect(r.findings.find(f => f.ruleId === 'XFER-001')).toBeUndefined();
    });

    it('escalates to CONFIRMED once the missing fact is supplied', async () => {
        const r = await engine.evaluate(profile({
            dataResidency: 'US', transferMechanism: 'NONE', dataSubjectLocation: 'DE'
        }));
        const xfer = r.findings.find(f => f.ruleId === 'XFER-001');
        expect(xfer!.applicability).toBe('CONFIRMED');
    });
});

describe('rules', () => {

    it('does not fire the retention rule inside the purpose ceiling', async () => {
        const r = await engine.evaluate(profile({retentionDays: 30, processingPurpose: 'MARKETING'}));
        expect(r.findings.find(f => f.ruleId === 'RET-001')).toBeUndefined();
    });

    it('treats an adequacy country as no transfer problem', async () => {
        const r = await engine.evaluate(profile({dataResidency: 'GB', transferMechanism: 'NONE'}));
        expect(r.findings.find(f => f.ruleId === 'XFER-001')).toBeUndefined();
    });

    it('flags raw special category data as CRITICAL', async () => {
        const r = await engine.evaluate(profile({
            piiElements: [{category: 'HEALTH', treatment: 'RAW'}]
        }));
        const pii = r.findings.find(f => f.ruleId === 'PII-001');
        expect(pii!.severity).toBe('CRITICAL');
    });

    it('clears special category data once it is encrypted', async () => {
        const r = await engine.evaluate(profile({
            piiElements: [{category: 'HEALTH', treatment: 'ENCRYPTED'}]
        }));
        expect(r.findings.find(f => f.ruleId === 'PII-001')).toBeUndefined();
    });

    it('carries a law mapping on every finding', async () => {
        const r = await engine.evaluate(profile({
            retentionDays: 3650, processingPurpose: 'MARKETING',
            dataResidency: 'US', piiElements: [{category: 'HEALTH', treatment: 'RAW'}],
            subprocessors: ['AWS']
        }));
        expect(r.findings.length).toBeGreaterThan(0);
        r.findings.forEach(f => {
            expect(f.lawMappings.length).toBeGreaterThan(0);
            expect(f.lawMappings[0].framework).toBe('GDPR');
        });
    });
});

describe('provenance', () => {

    it('labels engine output as engine/fixture', async () => {
        const r = await engine.evaluate(profile());
        expect(r.provenance.source).toBe('engine');
        expect(r.provenance.mode).toBe('fixture');
    });

    it('labels every finding, not just the envelope', async () => {
        const r = await engine.evaluate(profile({retentionDays: 900, processingPurpose: 'MARKETING'}));
        r.findings.forEach(f => {
            expect(f.provenance.source).toBe('engine');
            expect(f.provenance.mode).toBe('fixture');
        });
    });
});

describe('scenarios', () => {

    it('resolves the retention finding when retention drops', async () => {
        const base = profile({retentionDays: 900, processingPurpose: 'MARKETING'});
        const changed = applyModifications(base, [{path: 'retentionDays', from: 900, to: 30}]);

        const before = await engine.evaluate(base);
        const after = await engine.evaluate(changed.profile);
        const delta = diffResults(before, after);

        expect(delta.find(d => d.ruleId === 'RET-001')!.kind).toBe('RESOLVED');
    });

    it('resolves the transfer finding when residency moves into the EEA', async () => {
        const base = profile({dataResidency: 'US', transferMechanism: 'NONE'});
        const changed = applyModifications(base, [{path: 'dataResidency', from: 'US', to: 'DE'}]);

        const delta = diffResults(await engine.evaluate(base), await engine.evaluate(changed.profile));
        expect(delta.find(d => d.ruleId === 'XFER-001')!.kind).toBe('RESOLVED');
    });

    it('changes a PII element treatment by category', async () => {
        const base = profile({piiElements: [{category: 'EMAIL', treatment: 'RAW'}]});
        const changed = applyModifications(base, [
            {path: 'piiElements.EMAIL.treatment', from: 'RAW', to: 'PSEUDONYMIZED'}
        ]);
        expect(changed.profile.piiElements[0].treatment).toBe('PSEUDONYMIZED');
        expect(changed.applied.length).toBe(1);
    });

    it('does not mutate the baseline profile', async () => {
        const base = profile({retentionDays: 900});
        applyModifications(base, [{path: 'retentionDays', from: 900, to: 1}]);
        expect(base.retentionDays).toBe(900);
    });

    it('rejects a path that is not on the allowlist', () => {
        const base = profile();
        const changed = applyModifications(base, [
            {path: '__proto__.polluted', from: null, to: 'x'},
            {path: 'constructor.prototype.x', from: null, to: 'y'}
        ]);
        expect(changed.applied).toEqual([]);
        expect(changed.rejected.length).toBe(2);
        expect(({} as any).polluted).toBeUndefined();
    });
});
