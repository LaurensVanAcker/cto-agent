import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
    selector: 'dps-legal-info-footer',
    imports: [TranslatePipe],
    templateUrl: './dps-legal-info-footer.component.html',
    styleUrl: './dps-legal-info-footer.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DpsLegalInfoFooterComponent {}
