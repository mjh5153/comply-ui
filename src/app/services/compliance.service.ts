

import {Injectable, inject} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../environments/environment';
import {
    ProcessingProfile, EvaluationResult, ScenarioResult, RuleCatalogue,
    ProfileModification, FindingsExplanation, ExplanationQuestion
} from '../model/compliance';

/**
 * Client for the compliance layer, reached through the BFF like everything else.
 *
 *   this service -> /api/... -> Express BFF -> compliance engine
 *
 * Note the engine is INSIDE the BFF, not in Spring: the COMPLY API has no
 * compliance endpoints. Callers must read provenance.mode on every result and
 * present 'fixture' output as locally generated.
 */
@Injectable({providedIn: 'root'})
export class ComplianceService {

    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiBaseUrl + '/api';

    /** The rule catalogue and its law mappings. */
    findRules(): Observable<RuleCatalogue> {
        return this.http.get<RuleCatalogue>(`${this.baseUrl}/comply/rules`);
    }

    findProfile(companyId: number): Observable<ProcessingProfile> {
        return this.http.get<ProcessingProfile>(`${this.baseUrl}/companies/${companyId}/profile`);
    }

    saveProfile(companyId: number, profile: ProcessingProfile): Observable<ProcessingProfile> {
        return this.http.put<ProcessingProfile>(
            `${this.baseUrl}/companies/${companyId}/profile`, profile);
    }

    evaluate(companyId: number): Observable<EvaluationResult> {
        return this.http.post<EvaluationResult>(
            `${this.baseUrl}/companies/${companyId}/evaluate`, {});
    }

    /**
     * Re-runs the SAME deterministic engine against a modified profile. The
     * modified result is engine output, not a generated narrative, and the
     * delta is computed server-side.
     */
    evaluateScenario(
        companyId: number, modifications: ProfileModification[]
    ): Observable<ScenarioResult> {
        return this.http.post<ScenarioResult>(
            `${this.baseUrl}/companies/${companyId}/evaluate/scenario`, {modifications});
    }

    /** Non-authoritative. Always returns provenance.source === 'ai'. */
    explain(
        companyId: number, ruleId: string, question: ExplanationQuestion
    ): Observable<FindingsExplanation> {
        return this.http.post<FindingsExplanation>(
            `${this.baseUrl}/explain`, {companyId, ruleId, question});
    }
}
