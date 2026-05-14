import { Routes } from '@angular/router';

import { CompanyComponent } from './company.component';
import { CompanyRouteEnum, CompanyRoutePathParam } from './company.routes.model';
import {
  COMPANY_GROUPS_ENABLED_GUARD,
  GROUP_USER_ROLE_GUARD,
} from './modules/groups/company-groups.guard';
import { COMPANY_ACTUALS_ENABLED_GUARD } from './modules/actuals/company-actuals.guard';

// PoC step 1 strip: TIME_REGISTRATION, PROFILE (company-user profile page) and
// USER_ACCOUNTS submodules are removed. ACTUALS is restored to use the original
// DPS prestatie-bevestigen flow verbatim. Re-add the others later if scope grows.
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
      // Old DPS planning page is out of scope — operators that still want it
      // can use the production app directly. PLANNING resolves to the PoC
      // planning surface (Bryntum grid + mockups 09/10/11/12/13).
      {
        path: CompanyRouteEnum.PLANNING, // 'planning-poc' as URL slug
        loadChildren: () =>
          import('./modules/planning-poc/planning-poc.routes').then(
            m => m.PLANNING_POC_ROUTES,
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
      {
        path: CompanyRouteEnum.POOL,
        loadChildren: () => import('./modules/pool/pool.routes').then(m => m.POOL_ROUTES),
      },
      {
        path: CompanyRouteEnum.ACTUALS,
        loadChildren: () =>
          import('./modules/actuals/company-actuals.routes').then(m => m.COMPANY_ACTUALS_ROUTES),
        canActivate: [COMPANY_ACTUALS_ENABLED_GUARD],
      },
      // Restored: company-user admin (the "key" icon in the sidebar). Per
      // QA reference (https://mystaffler.dev.wlnob.boemm.eu) this is the
      // page where COMPANY USERS get assigned to accessGroups (which we
      // call "vestigingen" now). Different from /pool — Pool is the
      // EMPLOYEE (uitzendkracht) side with invite + last-login. Both end
      // up assigned to vestigingen, but via different admin surfaces.
      {
        path: CompanyRouteEnum.USER_ACCOUNTS,
        loadChildren: () =>
          import('./modules/user-accounts/user-accounts.routes').then(
            m => m.COMPANY_USER_ACCOUNTS_ROUTES,
          ),
      },
      // Legacy '/planning' deep links — keep them resolvable so anything that
      // still hands out the old URL doesn't 404.
      { path: 'planning', redirectTo: CompanyRouteEnum.PLANNING, pathMatch: 'full' },
      // 'locations' admin page is gone (service-locations are managed inline
      // on the planning grid). Redirect any leftover deep link to /pool.
      { path: 'locations', redirectTo: CompanyRouteEnum.POOL, pathMatch: 'full' },
      {
        path: CompanyRouteEnum.MYSTAFFLER_PREVIEW,
        loadChildren: () =>
          import('./modules/mystaffler-preview/mystaffler-preview.routes').then(
            m => m.MYSTAFFLER_PREVIEW_ROUTES,
          ),
      },
      { path: '**', redirectTo: CompanyRouteEnum.PLANNING },
    ],
  },
];
