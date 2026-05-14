import { Routes } from '@angular/router';

export const DEMO_DIALOGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./demo-dialogs.component').then(m => m.DemoDialogsComponent),
  },
];
