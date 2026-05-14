import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Platform } from '@angular/cdk/platform';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { filter, map, Observable, shareReplay, switchMap, tap } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { InvitationApiService } from '@dps/core/api';
import { DpsLegalInfoFooterComponent, PageHeaderComponent } from '@dps/shared/components';
import { InvitationRouteEnum, InvitationRoutePathParam } from '../../invitation.routes.model';
import { EmployeeInvitationStatusEnum } from '@dps/shared/models';

@UntilDestroy()
@Component({
    selector: 'dps-invitation-welcome',
    imports: [
        CommonModule,
        TranslatePipe,
        ButtonModule,
        AccordionModule,
        ProgressSpinnerModule,
        DpsLegalInfoFooterComponent,
        PageHeaderComponent,
    ],
    templateUrl: './invitation-welcome.component.html',
    styleUrl: './invitation-welcome.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-column h-full' }
})
export class InvitationWelcomeComponent {
  constructor(
    private route: ActivatedRoute,
    private invitationApiService: InvitationApiService,
    private translateService: TranslateService,
    private title: Title,
    private router: Router,
    public platform: Platform
  ) {}

  readonly invitationStatusEnum = EmployeeInvitationStatusEnum;
  readonly invitation$ = this.route.paramMap.pipe(
    map(paramMap => paramMap.get(InvitationRoutePathParam.INVITATION_ID)),
    filter(Boolean),
    switchMap(invitationId => this.invitationApiService.getInvitation(invitationId)),
    shareReplay(),
    untilDestroyed(this)
  );
  readonly title$ = this.invitation$.pipe(
    switchMap(invitation =>
      this.translateService.stream('INVITATION_WELCOME.TITLE', {
        name: invitation.referenceName,
      })
    ),
    tap(title => this.title.setTitle(title.replace(/<[^>]*>/g, '')))
  );
  readonly itsMeRegistrationLink$: Observable<string> = this.invitation$.pipe(
    switchMap(invitation =>
      this.invitationApiService.getItsMeRegistrationLink({ state: invitation.oauthState })
    ),
    map(link => link.codeLink)
  );

  navigateToRegistration(): void {
    this.invitation$.subscribe(invitation =>
      this.router.navigate([InvitationRouteEnum.REGISTER], {
        relativeTo: this.route,
        state: { invitation },
      })
    );
  }
}
