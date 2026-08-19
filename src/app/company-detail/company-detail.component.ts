

import {Component, OnInit, inject, signal, computed, ChangeDetectionStrategy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatSelectModule} from '@angular/material/select';
import {MatInputModule} from '@angular/material/input';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatChipsModule} from '@angular/material/chips';
import {MatExpansionModule} from '@angular/material/expansion';
import {CompaniesService} from '../services/companies.service';
import {ComplianceService} from '../services/compliance.service';
import {Company} from '../model/company';
import {
    ProcessingProfile, EvaluationResult, Finding, ScenarioResult,
    ExplanationQuestion, FindingsExplanation, PiiTreatment
} from '../model/compliance';

/**
 * Interactive Compliance Findings Investigator.
 *
 * Three sources appear on this screen and are never allowed to blur:
 *
 *   COMPLY API   the company record        - authoritative, from Spring
 *   ENGINE       findings and scenarios    - deterministic; mode says fixture or live
 *   AI           explanations              - non-authoritative, never overwrites a field
 *
 * Provenance is read off each payload rather than assumed, so when the engine
 * moves to Spring the labels change on their own.
 */
@Component({
    selector: 'company-detail',
    standalone: true,
    imports: [
        CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule,
        MatIconModule, MatSelectModule, MatInputModule, MatProgressBarModule,
        MatChipsModule, MatExpansionModule
    ],
    templateUrl: './company-detail.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./company-detail.component.scss']
})
export class CompanyDetailComponent implements OnInit {

    private readonly route = inject(ActivatedRoute);
    private readonly companiesService = inject(CompaniesService);
    private readonly compliance = inject(ComplianceService);

    readonly companyId = signal(0);
    readonly company = signal<Company | null>(null);
    readonly profile = signal<ProcessingProfile | null>(null);
    readonly result = signal<EvaluationResult | null>(null);
    readonly scenario = signal<ScenarioResult | null>(null);
    readonly explanations = signal<{ [ruleId: string]: FindingsExplanation }>({});

    readonly loading = signal(false);
    readonly evaluating = signal(false);
    readonly error = signal('');

    readonly engineMode = computed(() => this.result()?.provenance.mode ?? null);

    readonly purposes = ['MARKETING', 'ANALYTICS', 'SERVICE_DELIVERY', 'FINANCIAL_RECORDS', 'HR', 'SECURITY'];
    readonly bases = ['CONSENT', 'CONTRACT', 'LEGITIMATE_INTEREST', 'LEGAL_OBLIGATION'];
    readonly mechanisms = ['NONE', 'SCC', 'ADEQUACY', 'BCR'];
    readonly residencies = ['US', 'DE', 'IE', 'GB', 'SG', 'BR'];
    readonly treatments: PiiTreatment[] = ['RAW', 'PSEUDONYMIZED', 'ENCRYPTED', 'ANONYMIZED'];

    readonly questions: { key: ExplanationQuestion, label: string }[] = [
        {key: 'PLAIN_LANGUAGE', label: 'Explain in plain language'},
        {key: 'TRIGGERING_FACTS', label: 'Show triggering facts'},
        {key: 'WHY_APPLICABILITY', label: 'Why this applicability?'},
        {key: 'MISSING_INFORMATION', label: 'What is missing?'},
        {key: 'RECOMMENDED_CONTROLS', label: 'Explain controls'}
    ];

    // Scenario controls
    scenarioRetention: number | null = null;
    scenarioResidency = '';
    scenarioEmailTreatment = '';

    ngOnInit() {
        const id = Number(this.route.snapshot.paramMap.get('id'));
        this.companyId.set(id);
        this.loading.set(true);

        this.companiesService.findCompanyById(id).subscribe({
            next: c => { this.company.set(c); this.loading.set(false); },
            error: err => { this.error.set(this.describe(err)); this.loading.set(false); }
        });

        this.compliance.findProfile(id).subscribe({
            next: p => { this.profile.set(p); this.evaluate(); },
            error: err => this.error.set(this.describe(err))
        });
    }

    evaluate() {
        this.evaluating.set(true);
        this.scenario.set(null);
        this.compliance.evaluate(this.companyId()).subscribe({
            next: r => { this.result.set(r); this.evaluating.set(false); },
            error: err => { this.error.set(this.describe(err)); this.evaluating.set(false); }
        });
    }

    saveProfile() {
        const p = this.profile();
        if (!p) { return; }
        this.evaluating.set(true);
        this.compliance.saveProfile(this.companyId(), p).subscribe({
            next: saved => { this.profile.set(saved); this.explanations.set({}); this.evaluate(); },
            error: err => { this.error.set(this.describe(err)); this.evaluating.set(false); }
        });
    }

    ask(finding: Finding, question: ExplanationQuestion) {
        this.compliance.explain(this.companyId(), finding.ruleId, question).subscribe({
            next: e => this.explanations.update(map => ({...map, [finding.ruleId]: e})),
            error: err => this.error.set(this.describe(err))
        });
    }

    dismissExplanation(ruleId: string) {
        this.explanations.update(map => {
            const next = {...map};
            delete next[ruleId];
            return next;
        });
    }

    runScenario() {
        const mods: { path: string, to: any }[] = [];

        if (this.scenarioRetention !== null && this.scenarioRetention !== undefined) {
            mods.push({path: 'retentionDays', to: Number(this.scenarioRetention)});
        }
        if (this.scenarioResidency) {
            mods.push({path: 'dataResidency', to: this.scenarioResidency});
        }
        if (this.scenarioEmailTreatment) {
            mods.push({path: 'piiElements.EMAIL.treatment', to: this.scenarioEmailTreatment});
        }
        if (mods.length === 0) {
            this.error.set('Choose at least one change to explore.');
            return;
        }

        this.error.set('');
        this.evaluating.set(true);

        this.compliance.evaluateScenario(this.companyId(), mods).subscribe({
            next: s => { this.scenario.set(s); this.evaluating.set(false); },
            error: err => { this.error.set(this.describe(err)); this.evaluating.set(false); }
        });
    }

    clearScenario() {
        this.scenario.set(null);
        this.scenarioRetention = null;
        this.scenarioResidency = '';
        this.scenarioEmailTreatment = '';
    }

    /** Template expressions cannot contain arrow functions, so parsing lives here. */
    setSubprocessors(profile: ProcessingProfile, raw: string) {
        profile.subprocessors = String(raw)
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    explanationFor(ruleId: string): FindingsExplanation | null {
        return this.explanations()[ruleId] || null;
    }

    private describe(err: any): string {
        if (err.status === 0) { return 'Cannot reach the BFF on port 9000. Is `npm run server` running?'; }
        if (err.status === 502) { return 'The BFF could not reach the COMPLY API (is Spring Boot up on 8080?).'; }
        if (err.status === 504) { return 'The COMPLY API timed out.'; }
        if (err.status === 404) { return (err.error && err.error.message) || 'Not found.'; }
        return (err.error && err.error.message) || `Request failed (${err.status}).`;
    }
}
