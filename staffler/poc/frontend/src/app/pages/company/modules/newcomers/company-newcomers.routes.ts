import { Routes } from '@angular/router';
import {
  CompanyNewcomersRouteEnum,
  CompanyNewcomersRoutePathParam,
} from './company-newcomers.routes.model';

export const COMPANY_NEWCOMERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./company-newcomers.component').then(m => m.CompanyNewcomersComponent),
  },
  {
    path: `:${CompanyNewcomersRoutePathParam.NEWCOMER_ID}`,
    children: [
      {
        path: CompanyNewcomersRouteEnum.PROFILE,
        loadComponent: () =>
          import('./components/newcomer-profile/newcomer-profile.component').then(
            c => c.NewcomerProfileComponent
          ),
      },
    ],
  },
];
