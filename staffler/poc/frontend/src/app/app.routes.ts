import { Routes } from '@angular/router';

import { authenticatedGuard } from '@dps/core/api/auth';
import { AUTH_ROUTES } from './pages/auth';
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
    path: AppRouteEnum.INVITATION,
    loadChildren: () =>
      import('./pages/invitation/invitation.routes').then(m => m.INVITATION_ROUTES),
  },
  // PoC: search page, signin (Cognito-callback helper) and admin (BoemmAD)
  // routes are stripped — see step 1 in the PoC plan.
  { path: '**', redirectTo: AppRouteEnum.COMPANY },
];
