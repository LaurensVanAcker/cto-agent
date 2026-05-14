import { Routes } from '@angular/router';

export const COMPANY_ACTUALS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./company-actuals.component').then(m => m.CompanyActualsComponent),
  },
];
