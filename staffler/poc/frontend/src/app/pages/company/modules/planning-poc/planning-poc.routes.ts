import { Routes } from '@angular/router';

export const PLANNING_POC_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./planning-poc.component').then(m => m.PlanningPocComponent),
  },
];
