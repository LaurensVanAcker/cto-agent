import { Routes } from '@angular/router';

import { CompanyComponent } from './company.component';
import { CompanyRouteEnum, CompanyRoutePathParam } from './company.routes.model';
import {
  COMPANY_GROUPS_ENABLED_GUARD,
  GROUP_USER_ROLE_GUARD,
} from './modules/groups/company-groups.guard';

// PoC step 1 strip: TIME_REGISTRATION, ACTUALS, PROFILE (company-user
// profile page) and USER_ACCOUNTS submodules are removed. Their routes,
// guards and source files are gone. Re-add later if the PoC scope grows.
export const COMPANY_ROUTES: Routes = [
  {
    path: `:${CompanyRoutePathParam.COMPANY_ID}`,
    component: CompanyComponent,
    children: [
      {
        path: CompanyRouteEnum.ONBOARDING,
        loadComponent: () =>
          import('./modules/onboarding/company-onboarding.component').then(
            c => c.CompanyOnboardingComponent
          ),
      },
      {
        path: CompanyRouteEnum.PLANNING,
        loadComponent: () =>
          import('./modules/planning/company-planning.component').then(
            c => c.CompanyPlanningComponent
          ),
      },
      {
        path: CompanyRouteEnum.NEWCOMERS,
        loadChildren: () =>
          import('./modules/newcomers/company-newcomers.routes').then(
            m => m.COMPANY_NEWCOMERS_ROUTES
          ),
      },
      {
        path: CompanyRouteEnum.INVITATIONS,
        loadChildren: () =>
          import('./modules/invitations/company-invitations.routes').then(
            m => m.COMPANY_INVITATIONS_ROUTES
          ),
      },
      {
        path: CompanyRouteEnum.GROUPS,
        loadChildren: () =>
          import('./modules/groups/company-groups.routes').then(m => m.COMPANY_GROUPS_ROUTES),
        canActivate: [COMPANY_GROUPS_ENABLED_GUARD, GROUP_USER_ROLE_GUARD],
      },
      { path: '**', redirectTo: CompanyRouteEnum.PLANNING },
    ],
  },
];
