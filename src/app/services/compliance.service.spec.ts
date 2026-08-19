

import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {ComplianceService} from './compliance.service';
import {CompaniesService} from './companies.service';

/**
 * These tests exist to protect one architectural rule: Angular talks to the
 * BFF over relative /api paths and never learns the Spring host or port.
 * A regression here would silently bypass the BFF boundary.
 */
describe('API boundary', () => {

    let compliance: ComplianceService;
    let companies: CompaniesService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                CompaniesService,
                provideHttpClient(),
                provideHttpClientTesting()
            ]
        });
        compliance = TestBed.inject(ComplianceService);
        companies = TestBed.inject(CompaniesService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('requests companies from a relative BFF path', () => {
        companies.findAllCompanies().subscribe();
        const req = http.expectOne('/api/companies');
        expect(req.request.method).toBe('GET');
    });

    it('never addresses the Spring host directly', () => {
        compliance.evaluate(1).subscribe();
        compliance.findRules().subscribe();
        companies.findCompanyById(1).subscribe();

        http.match(() => true).forEach(req => {
            expect(req.request.url.startsWith('/api/')).toBe(true);
            expect(req.request.url).not.toContain('8080');
            expect(req.request.url).not.toContain('localhost');
            req.flush({});
        });
    });

    it('evaluates a company by POST', () => {
        compliance.evaluate(9).subscribe();
        const req = http.expectOne('/api/companies/9/evaluate');
        expect(req.request.method).toBe('POST');
        req.flush({companyId: 9, findings: [], profile: {}, provenance: {source: 'engine', mode: 'fixture'}});
    });

    it('sends scenario modifications as structured paths, not free text', () => {
        compliance.evaluateScenario(9, [{path: 'retentionDays', to: 30}]).subscribe();
        const req = http.expectOne('/api/companies/9/evaluate/scenario');
        expect(req.request.body.modifications[0].path).toBe('retentionDays');
        expect(req.request.body.modifications[0].to).toBe(30);
        req.flush({});
    });

    it('sends only minimal structured context when asking for an explanation', () => {
        compliance.explain(9, 'RET-001', 'WHY_APPLICABILITY').subscribe();
        const req = http.expectOne('/api/explain');
        expect(Object.keys(req.request.body).sort()).toEqual(['companyId', 'question', 'ruleId']);
        req.flush({});
    });
});
