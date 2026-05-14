import { Routes } from '@angular/router';

export const COMPANY_USER_ACCOUNTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./user-accounts.component').then(m => m.UserAccountsComponent),
  },
];
