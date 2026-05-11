import { Routes } from '@angular/router';

import { adminUserAccessGuard, authenticatedGuard } from '@dps/core/api/auth';
import { AUTH_ROUTES } from './pages/auth';
import { environment } from '@dps/env';
import { AppRouteEnum } from './app.routes.model';

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: AppRouteEnum.EMPLOYEE,
    loadChildren: () => import('./pages/employee/employee.routes').then(m => m.EMPLOYEE_ROUTES),
    canMatch: [authenticatedGuard],
  },
  {
    path: AppRouteEnum.COMPANY,
    loadChildren: () => import('./pages/company/company.routes').then(m => m.COMPANY_ROUTES),
    canMatch: [authenticatedGuard],
  },
  {
    path: AppRouteEnum.SEARCH,
    loadComponent: () => import('./pages/search/search.component').then(c => c.SearchComponent),
    canMatch: [authenticatedGuard, adminUserAccessGuard],
  },
  {
    path: AppRouteEnum.INVITATION,
    loadChildren: () =>
      import('./pages/invitation/invitation.routes').then(m => m.INVITATION_ROUTES),
  },
  {
    // Helper component for authentication to capture skey query param after BE redirect
    path: 'signin',
    loadComponent: () => import('./pages/signin/signin.component').then(c => c.SigninComponent),
  },
  {
    path: 'admin',
    loadComponent: () => new Promise(() => (window.location.href = environment.boemmLoginUrl)),
  },
  { path: '**', redirectTo: AppRouteEnum.SEARCH },
];
