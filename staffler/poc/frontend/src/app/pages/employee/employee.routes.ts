import { Routes } from '@angular/router';
import { EmployeeComponent } from './employee.component';
import { EmployeeRouteEnum, EmployeeRoutePathParam } from './employee.routes.model';

export const EMPLOYEE_ROUTES: Routes = [
  {
    path: `:${EmployeeRoutePathParam.EMPLOYEE_ID}`,
    component: EmployeeComponent,
    children: [
      {
        path: EmployeeRouteEnum.PROFILE,
        loadComponent: () =>
          import('./components/employee-profile/employee-profile.component').then(
            c => c.EmployeeProfileComponent
          ),
      },
      { path: '**', redirectTo: EmployeeRouteEnum.PROFILE },
    ],
  },
];
