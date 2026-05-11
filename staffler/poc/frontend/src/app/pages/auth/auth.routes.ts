import { Routes } from '@angular/router';
import { unauthenticatedGuard } from '@dps/core/api/auth';
import { AuthRoutePath } from './auth.routes.model';

export const AUTH_ROUTES: Routes = [
  {
    path: AuthRoutePath.LOGIN,
    loadComponent: () => import('./login/login.component').then(c => c.LoginComponent),
    canMatch: [unauthenticatedGuard],
  },
  {
    path: AuthRoutePath.SET_PASSWORD,
    loadComponent: () =>
      import('./set-password/set-password.component').then(c => c.SetPasswordComponent),
    canMatch: [unauthenticatedGuard],
  },
  {
    path: AuthRoutePath.FORGOT_PASSWORD,
    loadComponent: () =>
      import('./forgot-password/forgot-password.component').then(c => c.ForgotPasswordComponent),
    canMatch: [unauthenticatedGuard],
  },
  {
    path: AuthRoutePath.RESET_PASSWORD,
    loadComponent: () =>
      import('./reset-password/reset-password.component').then(c => c.ResetPasswordComponent),
    canMatch: [unauthenticatedGuard],
  },
];
