import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'dps-employee',
    imports: [RouterOutlet],
    templateUrl: './employee.component.html',
    styleUrl: './employee.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeComponent {}
