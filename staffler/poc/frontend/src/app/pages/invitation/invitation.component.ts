import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'dps-invitation',
    imports: [RouterOutlet],
    templateUrl: './invitation.component.html',
    styleUrl: './invitation.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InvitationComponent {}
