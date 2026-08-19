

import {Injectable} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {Observable} from "rxjs";
import {Company} from "../model/company";
import {environment} from "../../environments/environment";

/**
 * Client for the COMPLY API, reached through the BFF rather than directly.
 *
 *   this service -> /api/companies -> BFF (server/) -> Spring Boot /companies
 *
 * Paths are built from environment.apiBaseUrl, which is empty by default so
 * that requests stay relative. Relative requests are handled by the Angular
 * dev-server proxy locally, and by the BFF itself in production when it
 * serves the built app. Set apiBaseUrl only when the UI is deployed to a
 * separate origin from the BFF.
 *
 * Responses are returned unwrapped: unlike the course fixtures, the COMPLY
 * API has no 'payload' envelope.
 */
@Injectable()
export class CompaniesService {

    private readonly baseUrl = environment.apiBaseUrl + '/api';

    constructor(private http: HttpClient) {

    }

    findAllCompanies(): Observable<Company[]> {
        return this.http.get<Company[]>(`${this.baseUrl}/companies`);
    }

    findCompanyById(companyId: number): Observable<Company> {
        return this.http.get<Company>(`${this.baseUrl}/companies/${companyId}`);
    }

    createCompany(company: Company): Observable<Company> {
        return this.http.post<Company>(`${this.baseUrl}/companies`, company);
    }

    updateCompany(companyId: number, company: Company): Observable<Company> {
        return this.http.put<Company>(`${this.baseUrl}/companies/${companyId}`, company);
    }

    deleteCompany(companyId: number): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/companies/${companyId}`);
    }

    // --- CompletableFuture-backed variants ------------------------------------

    createCompanyAsync(company: Company): Observable<Company> {
        return this.http.post<Company>(`${this.baseUrl}/companies/async`, company);
    }

    createCompaniesAsync(companies: Company[]): Observable<Company[]> {
        return this.http.post<Company[]>(`${this.baseUrl}/companies/batch/async`, companies);
    }

    updateCompanyAsync(companyId: number, company: Company): Observable<Company> {
        return this.http.put<Company>(`${this.baseUrl}/companies/${companyId}/async`, company);
    }

    // --- Compliance pipeline --------------------------------------------------

    processCompliance(company: Company): Observable<Company> {
        return this.http.post<Company>(`${this.baseUrl}/comply/process`, company);
    }

    processBatchCompliance(companies: Company[]): Observable<Company[]> {
        return this.http.post<Company[]>(`${this.baseUrl}/comply/process/batch`, companies);
    }

    /** Returns a plain-text summary, not JSON. */
    reconcileResponses(responses: string[]): Observable<string> {
        return this.http.post(`${this.baseUrl}/comply/reconcile`, responses, {
            responseType: 'text'
        });
    }

    sendConcurrentApiRequests(apiEndpoint: string, payload: { [key: string]: string }): Observable<string[]> {
        return this.http.post<string[]>(
            `${this.baseUrl}/comply/external-api/concurrent`, payload, {
                params: {apiEndpoint}
            });
    }
}
