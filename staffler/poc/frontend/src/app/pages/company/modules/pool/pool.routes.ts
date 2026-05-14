import { Routes } from '@angular/router';

export const POOL_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pool.component').then(m => m.PoolComponent),
  },
];
