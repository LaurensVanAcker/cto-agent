import { Routes } from '@angular/router';

export const COMPANY_LOCATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./company-locations.component').then(m => m.CompanyLocationsComponent),
  },
];
