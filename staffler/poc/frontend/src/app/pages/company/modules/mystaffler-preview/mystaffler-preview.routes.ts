import { Routes } from '@angular/router';

export const MYSTAFFLER_PREVIEW_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./mystaffler-preview.component').then(m => m.MystafflerPreviewComponent),
  },
];
