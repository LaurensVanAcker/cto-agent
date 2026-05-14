import { Routes } from '@angular/router';
import { InvitationRouteEnum, InvitationRoutePathParam } from './invitation.routes.model';

export const INVITATION_ROUTES: Routes = [
  {
    path: `:${InvitationRoutePathParam.INVITATION_ID}`,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./components/welcome/invitation-welcome.component').then(
            c => c.InvitationWelcomeComponent
          ),
      },
      {
        path: InvitationRouteEnum.REGISTER,
        loadComponent: () =>
          import('./components/self-registration/self-registration.component').then(
            c => c.SelfRegistrationComponent
          ),
      },
    ],
  },
];
