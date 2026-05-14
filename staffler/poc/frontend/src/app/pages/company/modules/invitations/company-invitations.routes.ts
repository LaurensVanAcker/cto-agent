import { Routes } from '@angular/router';
import { InvitationsRouteEnum } from './company-invitations.routes.model';

export const COMPANY_INVITATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./company-invitations.component').then(c => c.CompanyInvitationsComponent),
  },
  {
    path: InvitationsRouteEnum.CREATE,
    loadComponent: () =>
      import('./components/create-invitation/create-invitation.component').then(
        m => m.CreateInvitationComponent
      ),
  },
];
