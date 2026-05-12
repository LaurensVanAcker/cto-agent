import { Routes } from '@angular/router';

export const DEMO_PLANNING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./demo-planning.component').then(m => m.DemoPlanningComponent),
  },
];
