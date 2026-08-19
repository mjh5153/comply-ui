import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

const routes: Routes = [
    {
        path: '',
        pathMatch: 'full',
        redirectTo: '/companies'
    },
    {
        path: 'companies',
        loadComponent: () =>
            import('./companies/companies.component').then(m => m.CompaniesComponent)
    },
    {
        path: 'companies/:id',
        loadComponent: () =>
            import('./company-detail/company-detail.component').then(m => m.CompanyDetailComponent)
    },
    {
        path: '**',
        redirectTo: '/companies'
    }
];

@NgModule({
    imports: [RouterModule.forRoot(routes, {})],
    exports: [RouterModule]
})
export class AppRoutingModule {
}
