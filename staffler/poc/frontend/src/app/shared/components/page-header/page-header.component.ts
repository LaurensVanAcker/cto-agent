import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { DividerModule } from 'primeng/divider';

import { AppLocaleSelectorComponent } from '../app-locale-selector/app-locale-selector.component';
import { CompanyRouteEnum } from 'src/app/pages/company/company.routes.model';
import { COMPANY_ROUTES_ICONS_MAP } from '@dps/shared/configs';

@Component({
  selector: 'dps-page-header',
  standalone: true,
  imports: [CommonModule, DividerModule, AppLocaleSelectorComponent],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex px-3 py-2 md:py-3 border-bottom-1 border-200 z-1',
  },
})
export class PageHeaderComponent {
  constructor(private route: ActivatedRoute) {}

  readonly title = input<string>();
  readonly subtitle = input<string | null>();
  readonly routePath = (this.route.snapshot.routeConfig?.path ||
    this.route.snapshot.parent?.routeConfig?.path) as CompanyRouteEnum;
  readonly companyRoutesIconsMap = COMPANY_ROUTES_ICONS_MAP;
}
