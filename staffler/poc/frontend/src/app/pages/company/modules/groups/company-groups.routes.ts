import { Routes } from '@angular/router';

import { CompanyGroupsComponent } from './company-groups.component';
import { GroupsRouteEnum } from './company-groups.routes.model';

export const COMPANY_GROUPS_ROUTES: Routes = [
  {
    path: '',
    component: CompanyGroupsComponent,
  },
  {
    path: GroupsRouteEnum.CREATE,
    loadComponent: () =>
      import('./components/create-group/create-group.component').then(m => m.CreateGroupComponent),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
