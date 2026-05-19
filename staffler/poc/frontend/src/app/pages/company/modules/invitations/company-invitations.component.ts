import { CommonModule } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  combineLatest,
  debounceTime,
  filter,
  iif,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';

import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DialogService } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { PaginatorModule } from 'primeng/paginator';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { MultiSelectModule } from 'primeng/multiselect';

import { AuthStore, ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { CompanyGroupApiService, EmployeeApiService, InvitationApiService } from '@dps/core/api';
import { ActionCenterDialogComponent, PageHeaderComponent } from '@dps/shared/components';
import { DialogAddPermanentEmployeeComponent } from '@dps/shared/components/dialog-add-permanent-employee/dialog-add-permanent-employee.component';
import {
  EmployeeInvitationModel,
  EmployeeInvitationStatusEnum,
  UserRole,
} from '@dps/shared/models';
import { AppRouteEnum } from 'src/app/app.routes.model';
import { InvitationsRouteEnum } from './company-invitations.routes.model';
import { QueryParamsService } from '@dps/shared/services';
import { InvitationsListRequestParams } from '@dps/core/api/invitation/invitations-list-request.params';
import { emptyEnumerableValuesToUndefined } from '@dps/shared/functions';
import { AutoFocus } from 'primeng/autofocus';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CompanyRouteEnum } from '../../company.routes.model';
import { Store } from '@ngxs/store';
import { FloatLabelModule } from 'primeng/floatlabel';
import { OverlayBadgeModule } from 'primeng/overlaybadge';

@UntilDestroy()
@Component({
  selector: 'dps-company-invitations',
  imports: [
    CommonModule,
    RouterLink,
    TranslatePipe,
    ButtonModule,
    TableModule,
    PaginatorModule,
    ToastModule,
    PageHeaderComponent,
    TooltipModule,
    ReactiveFormsModule,
    MultiSelectModule,
    AutoFocus,
    ConfirmDialogModule,
    ActionCenterDialogComponent,
    FloatLabelModule,
    OverlayBadgeModule,
  ],
  providers: [ConfirmationService, DialogService],
  templateUrl: './company-invitations.component.html',
  styleUrl: './company-invitations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden' },
})
export class CompanyInvitationsComponent implements OnInit {
  constructor(
    private title: Title,
    private router: Router,
    private route: ActivatedRoute,
    private translateService: TranslateService,
    private invitationApiService: InvitationApiService,
    private clipboard: Clipboard,
    private messageService: MessageService,
    private fb: FormBuilder,
    private queryParamsService: QueryParamsService<InvitationsListRequestParams>,
    private confirmationService: ConfirmationService,
    private employeeApiService: EmployeeApiService,
    private companyGroupApiService: CompanyGroupApiService,
    private authStore: AuthStore,
    private store: Store,
    private dialogService: DialogService
  ) {}

  readonly employeeInvitationStatusEnum = EmployeeInvitationStatusEnum;
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  readonly title$ = this.translateService.stream('COMPANY_SIDENAV.NEW_EMPLOYEES');
  readonly wageFormat = '1.4-4';
  readonly mealVoucherFormat = '1.2-2';
  readonly isLoading = signal(true);
  readonly filtersForm = this.buildFiltersForm();
  private readonly filters$ = this.filtersForm.valueChanges.pipe(
    startWith(this.filtersForm.value),
    debounceTime(200),
    map(emptyEnumerableValuesToUndefined),
    shareReplay(1)
  );
  readonly invitations$ = combineLatest([
    this.company$,
    this.filtersForm.valueChanges.pipe(startWith(this.filtersForm.value)),
  ]).pipe(
    tap(() => this.isLoading.set(true)),
    switchMap(([company, filters]) =>
      this.invitationApiService.getInvitations({
        ...filters,
        companyId: company.id,
      })
    ),
    tap(() => this.isLoading.set(false)),
    shareReplay(1)
  );
  readonly invitationStatuses$: Observable<
    Array<{
      value: EmployeeInvitationStatusEnum;
      label: string;
    }>
  > = this.translateService.stream('INVITATIONS.STATUSES').pipe(
    map(statusesTranslation =>
      Object.values(EmployeeInvitationStatusEnum).map(status => ({
        value: status,
        label: statusesTranslation[status],
      }))
    )
  );
  readonly companyRouteEnum = CompanyRouteEnum;
  readonly hasNewcomers$: Observable<boolean> = this.company$.pipe(
    switchMap(company =>
      this.employeeApiService.getNewcomers({
        companyId: company.id,
        size: 1,
      })
    ),
    map(resp => !!resp.totalElements)
  );
  private readonly hasCompanyGroups$: Observable<boolean> = this.company$.pipe(
    take(1),
    switchMap(company => this.companyGroupApiService.getGroups(company.id, { size: 1 })),
    map(resp => !!resp.totalElements)
  );
  readonly isInviteNewEmployeeBtnShown$: Observable<boolean> = iif(
    () => this.authStore.hasRoles([UserRole.GROUP_USER]),
    this.hasCompanyGroups$,
    of(true)
  );
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);

  ngOnInit(): void {
    this.title$.pipe(untilDestroyed(this)).subscribe(title => this.title.setTitle(title));

    this.filters$
      .pipe(untilDestroyed(this))
      .subscribe(filters => this.queryParamsService.setQueryParams(filters));
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  navigateToCreateInvitationPage(): void {
    this.router.navigate([InvitationsRouteEnum.CREATE], { relativeTo: this.route });
  }

  /**
   * Pilot feedback 2026-05-19: "Uitnodigingen" is now reached from the pool
   * toolbar (the sidebar entry was removed). Mirror that flow with an
   * explicit back button so users have a clear way back without relying on
   * the browser history.
   */
  goToPool(): void {
    this.company$.pipe(take(1)).subscribe(company => {
      this.router.navigate([AppRouteEnum.COMPANY, company.id, CompanyRouteEnum.POOL]);
    });
  }

  /**
   * Open the permanent-employee creation dialog. Bypasses the existing
   * invitation/Dimona flow — vaste medewerkers go straight into PoC-DB.
   * After creation we re-fire the filters subject so the user sees the
   * count refresh; the planning grid picks the new row up on next refresh.
   */
  openAddPermanentDialog(): void {
    this.company$.pipe(take(1)).subscribe(company => {
      const ref = this.dialogService.open(DialogAddPermanentEmployeeComponent, {
        header: 'Vaste medewerker toevoegen',
        modal: true,
        width: '28rem',
        data: { companyId: company.id },
      });
      ref.onClose.subscribe(result => {
        if (result?.kind === 'permanent-employee.created') {
          this.messageService.add({
            severity: 'success',
            summary: 'Vaste medewerker aangemaakt',
            detail: `${result.row.first_name} ${result.row.last_name}`,
          });
          // Re-fire the filter pipeline so any list refreshes.
          this.filtersForm.patchValue(this.filtersForm.value);
        }
      });
    });
  }

  copyInvitationLink(invitation: EmployeeInvitationModel): void {
    const invitationLink = `${window.location.origin}/${AppRouteEnum.INVITATION}/${invitation.id}`;

    if (this.clipboard.copy(invitationLink)) {
      this.messageService.add({
        severity: 'success',
        summary: this.translateService.instant('INVITE_EMPLOYEE.INVITATION_LINK_COPIED'),
      });
    }
  }

  updateInvitation(invitation: EmployeeInvitationModel): void {
    this.confirmationService.confirm({
      accept: () =>
        this.invitationApiService
          .cancelInvitation(invitation.id, {
            id: invitation.id,
            companyId: invitation.company.id,
            status: EmployeeInvitationStatusEnum.CANCELED,
          })
          .subscribe(() => {
            this.filtersForm.patchValue(this.filtersForm.value);
          }),
    });
  }

  invitationTrackByFn(_index: number, inv: EmployeeInvitationModel): string {
    return inv.id;
  }

  private buildFiltersForm() {
    const form = this.fb.group({
      page: this.fb.nonNullable.control<number>(0),
      status: this.fb.nonNullable.control<Array<EmployeeInvitationStatusEnum>>([]),
    });

    const { status, ...restQueryParams } = this.queryParamsService.getQueryParamsSnapshot();

    form.patchValue({
      ...restQueryParams,
      status: status || [EmployeeInvitationStatusEnum.ACTIVE],
    });

    return form;
  }
}
