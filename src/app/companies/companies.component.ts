

import {Component, OnInit, inject, signal, ChangeDetectionStrategy} from '@angular/core';

import {RouterLink} from '@angular/router';
import {FormBuilder, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import {MatInputModule} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {CompaniesService} from '../services/companies.service';
import {Company} from '../model/company';

/**
 * Companies list and create form.
 *
 * Everything on this screen is REAL: companies are persisted by the Spring
 * COMPLY API via the BFF proxy. Only the compliance layer on the detail screen
 * is locally generated.
 */
@Component({
    selector: 'companies',
    standalone: true,
    imports: [
    RouterLink,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule
],
    template: `
        <div class="page">
        
          <header class="page-head">
            <div>
              <h1>Companies</h1>
              <p class="sub">Records served by the Spring COMPLY API through the BFF.</p>
            </div>
            <span class="badge badge-live">
              <mat-icon inline>verified</mat-icon> COMPLY API
            </span>
          </header>
        
          <mat-card class="create-card">
            <h2>Add a company</h2>
            <form [formGroup]="form" (ngSubmit)="create()" class="create-form">
              <mat-form-field appearance="outline">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name" placeholder="Acme Corp">
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput formControlName="email" placeholder="ops@acme.test">
              </mat-form-field>
              <button mat-flat-button color="primary" type="submit"
                [disabled]="form.invalid || saving()">
                {{ saving() ? 'Saving…' : 'Create' }}
              </button>
            </form>
            @if (error()) {
              <p class="error">{{ error() }}</p>
            }
          </mat-card>
        
          @if (loading()) {
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          }
        
          <div class="grid">
            @for (c of companies(); track c.id) {
              <mat-card class="company-card">
                <div class="company-id">#{{ c.id }}</div>
                <h3>{{ c.name }}</h3>
                <p class="email">{{ c.email }}</p>
                <a mat-stroked-button color="primary" [routerLink]="['/companies', c.id]">
                  Investigate compliance
                </a>
              </mat-card>
            }
          </div>
        
          @if (!loading() && companies().length === 0) {
            <p class="empty">
              No companies yet. Create one above.
            </p>
          }
        </div>
        `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [`
        .page { max-width: 1100px; margin: 0 auto; padding: 24px; }
        .page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        h1 { margin: 0 0 4px; font-size: 28px; }
        .sub { margin: 0; color: rgba(0,0,0,.6); }
        .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
                 border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .badge-live { background: #e6f4ea; color: #1e6b34; }
        .create-card { margin: 20px 0; padding: 16px; }
        .create-card h2 { margin: 0 0 12px; font-size: 16px; }
        .create-form { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
        .create-form mat-form-field { flex: 1 1 220px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
        .company-card { padding: 16px; position: relative; }
        .company-id { position: absolute; top: 12px; right: 14px; font-size: 12px; color: rgba(0,0,0,.4); }
        .company-card h3 { margin: 0 0 4px; font-size: 18px; }
        .email { margin: 0 0 14px; color: rgba(0,0,0,.6); font-size: 14px; }
        .error { color: #b3261e; margin: 8px 0 0; }
        .empty { color: rgba(0,0,0,.5); text-align: center; padding: 32px; }
    `]
})
export class CompaniesComponent implements OnInit {

    private readonly companiesService = inject(CompaniesService);
    private readonly fb = inject(FormBuilder);

    readonly companies = signal<Company[]>([]);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly error = signal<string>('');

    readonly form = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]]
    });

    ngOnInit() {
        this.load();
    }

    private load() {
        this.loading.set(true);
        this.companiesService.findAllCompanies().subscribe({
            next: companies => {
                this.companies.set(companies);
                this.loading.set(false);
            },
            error: err => {
                this.error.set(this.describe(err));
                this.loading.set(false);
            }
        });
    }

    create() {
        if (this.form.invalid) {
            return;
        }
        this.saving.set(true);
        this.error.set('');

        this.companiesService.createCompany(this.form.getRawValue() as Company).subscribe({
            next: () => {
                this.form.reset({name: '', email: ''});
                this.saving.set(false);
                this.load();
            },
            error: err => {
                this.error.set(this.describe(err));
                this.saving.set(false);
            }
        });
    }

    /** Preserves the distinction the BFF deliberately relays. */
    private describe(err: any): string {
        if (err.status === 0) { return 'Cannot reach the BFF on port 9000. Is `npm run server` running?'; }
        if (err.status === 502) { return 'The BFF could not reach the COMPLY API (is Spring Boot up on 8080?).'; }
        if (err.status === 504) { return 'The COMPLY API timed out.'; }
        return (err.error && err.error.message) || `Request failed (${err.status}).`;
    }
}
