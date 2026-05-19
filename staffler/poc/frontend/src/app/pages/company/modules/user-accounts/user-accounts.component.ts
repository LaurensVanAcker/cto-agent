import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  ReplaySubject,
  shareReplay,
  switchMap,
  take,
} from 'rxjs';

import { TableModule } from 'primeng/table';
import { PaginatorModule } from 'primeng/paginator';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { Confirmation, ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ChipModule } from 'primeng/chip';

import {
  ActionCenterDialogComponent,
  AssignGroupsDialogComponent,
  AssignGroupsDialogData,
  PageHeaderComponent,
} from '@dps/shared/components';
import { CompanyApiService, UserApiService } from '@dps/core/api';
import { AuthStore, ChangeSidenavVisibility, RootState } from '@dps/core/store';
import { CompanyUser, UserRole, Group, CompanyUserStatus } from '@dps/shared/models';
import { AddNewAccountComponent } from './components/add-new-account/add-new-account.component';
import { AuthApiService } from '@dps/core/api/auth';
import { Store } from '@ngxs/store';
import { OverlayBadgeModule } from 'primeng/overlaybadge';
import { MessageModule } from 'primeng/message';

@UntilDestroy()
@Component({
  selector: 'dps-user-accounts',
  imports: [
    CommonModule,
    PageHeaderComponent,
    TranslatePipe,
    TableModule,
    PaginatorModule,
    ButtonModule,
    ConfirmDialogModule,
    ToastModule,
    ChipModule,
    MenuModule,
    ActionCenterDialogComponent,
    OverlayBadgeModule,
    MessageModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './user-accounts.component.html',
  styleUrl: './user-accounts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-auto flex-column overflow-hidden',
  },
})
export class UserAccountsComponent implements OnInit {
  constructor(
    private translateService: TranslateService,
    private title: Title,
    private companyApiService: CompanyApiService,
    private dialogService: DialogService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService,
    private authStore: AuthStore,
    private authApiService: AuthApiService,
    private store: Store,
    private userApiService: UserApiService
  ) {}

  readonly removeUserConfirmDialogKey = 'remove-user-confirm-dialog';
  readonly userRoleEnum = UserRole;
  readonly canManipulateUsers = this.authStore.hasRoles([
    UserRole.FULL_ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.SALES_ADMIN,
    UserRole.DPS_DIRECTOR,
    UserRole.DPS_SALES,
    UserRole.CREDIT_CONTROLLER,
    UserRole.PREVENTION_ADVISOR,
    UserRole.RECRUITER,
    UserRole.COMPANY_USER,
  ]);
  readonly currUser$ = this.authStore.getCurrUserData$();
  readonly company$ = this.store.select(RootState.getCompanyData).pipe(filter(Boolean), take(1));
  readonly isCompanyGroupsEnabled = this.store.selectSignal(RootState.isCompanyGroupsEnabled);
  readonly pageIndex$ = new BehaviorSubject(0);
  readonly listRefresher$ = new BehaviorSubject<void>(undefined);
  readonly companyUsers$ = combineLatest([
    this.company$.pipe(take(1)),
    this.pageIndex$.asObservable(),
    this.listRefresher$.asObservable(),
  ]).pipe(
    switchMap(([company, page]) =>
      this.companyApiService.getCompanyUsers({
        companyId: company.id,
        page,
      })
    ),
    shareReplay(1)
  );
  readonly titleTranslation$ = this.translateService.stream('COMPANY_USER_ACCOUNTS.TITLE');
  readonly activeUserAccount$ = new ReplaySubject<CompanyUser>(1);
  readonly activeUserAccountMenuItems$: Observable<MenuItem[]> = this.activeUserAccount$
    .asObservable()
    .pipe(
      distinctUntilChanged(
        (prevUser, currUser) => prevUser.userId === currUser.userId && prevUser.role === currUser.role
      ),
      map(activeUserAccount => [
        {
          label: 'COMPANY_USER_ACCOUNTS.ASSIGN_GROUPS',
          icon: 'dps-icon dps-icon-building',
          visible:
            this.isCompanyGroupsEnabled() &&
            activeUserAccount.role === UserRole.GROUP_USER &&
            this.canManipulateUsers,
          command: () => this.openAssignGroupsDialog(activeUserAccount),
        },
        {
          label: 'COMPANY_USER_ACCOUNTS.USER_ACCOUNT_MENU.LIMIT_ACCESS_RIGHTS',
          visible:
            this.isCompanyGroupsEnabled() && activeUserAccount.role === UserRole.COMPANY_USER,
          command: () => this.updateUserAccountAccessRole(activeUserAccount),
        },
        {
          label: 'COMPANY_USER_ACCOUNTS.USER_ACCOUNT_MENU.EXPAND_ACCESS_RIGHTS',
          icon: 'dps-icon dps-icon-key',
          visible: this.isCompanyGroupsEnabled() && activeUserAccount.role === UserRole.GROUP_USER,
          command: () => this.updateUserAccountAccessRole(activeUserAccount),
        },
        // Temporarily disabled
        // {
        //   label: 'COMPANY_USER_ACCOUNTS.USER_ACCOUNT_MENU.RESET_ACCOUNT',
        //   visible: activeUserAccount.status === CompanyUserStatus.CONFIRMED,
        //   command: () => this.resetUserAccount(activeUserAccount),
        // },
        {
          label: 'COMPANY_USER_ACCOUNTS.USER_ACCOUNT_MENU.RESEND_INVITATION',
          visible: activeUserAccount.status === CompanyUserStatus.FORCE_CHANGE_PASSWORD,
          command: () => this.resendUserInvitation(activeUserAccount),
        },
        {
          label: 'COMPANY_USER_ACCOUNTS.USER_ACCOUNT_MENU.REMOVE_ACCOUNT',
          icon: 'dps-icon dps-icon-delete',
          command: () => this.removeUser(activeUserAccount),
          itemContentClass: 'text-red-500',
        },
      ])
    );
  readonly isMobileScreen = this.store.selectSignal(RootState.isMobileScreen);
  readonly companyActualsCount = this.store.selectSignal(RootState.getCompanyActualsCount);

  ngOnInit(): void {
    this.titleTranslation$
      .pipe(untilDestroyed(this))
      .subscribe(titleTranslation => this.title.setTitle(titleTranslation));
  }

  showSidenav(): void {
    this.store.dispatch(new ChangeSidenavVisibility(true));
  }

  openAddNewAccountDialog(): void {
    this.dialogService
      .open(AddNewAccountComponent, {
        modal: true,
        header: this.translateService.instant('COMPANY_USER_ACCOUNTS.INVITE_CUSTOMERS'),
        closable: true,
        closeOnEscape: true,
      })
      .onClose.pipe(filter(Boolean))
      .subscribe(() => {
        this.listRefresher$.next();
        this.messageService.add({
          severity: 'success',
          summary: this.translateService.instant(
            'COMPANY_USER_ACCOUNTS.CUSTOMER_INVITED_SUCCESSFULLY'
          ),
        });
      });
  }

  companyUsersTrackByFn(_index: number, user: CompanyUser): string {
    return user.userId;
  }

  openAssignGroupsDialog(user: CompanyUser): void {
    const dialogConfig: DynamicDialogConfig<AssignGroupsDialogData> = {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      data: {
        existingGroups: user.accessGroups,
        headerTitle: this.translateService.instant(
          'COMPANY_USER_ACCOUNTS.ASSIGN_GROUPS_TO_ACCOUNT',
          {
            account: user.email,
          }
        ),
      },
    };

    this.dialogService
      .open(AssignGroupsDialogComponent, dialogConfig)
      .onClose.pipe(
        filter(Boolean),
        switchMap((selectedGroups: Group[]) =>
          this.companyApiService.updateUserAccess(user.companyId, user.userId, {
            role: user.role,
            accessGroups: selectedGroups,
          })
        )
      )
      .subscribe(() => {
        this.listRefresher$.next();
        this.openChangesSavedToast();
      });
  }

  removeGroupFromAccount(user: CompanyUser, groupIndex: number): void {
    user.accessGroups.splice(groupIndex, 1);

    this.companyApiService
      .updateUserAccess(user.companyId, user.userId, {
        role: user.role,
        accessGroups: user.accessGroups,
      })
      .subscribe(() => {
        this.listRefresher$.next();
        this.openChangesSavedToast();
      });
  }

  private resendUserInvitation(activeUser: CompanyUser): void {
    this.confirmationService.confirm({
      message: this.translateService.instant(
        'COMPANY_USER_ACCOUNTS.CONFIRM_USER_INVITATION_RESEND',
        {
          email: activeUser.email,
        }
      ),
      accept: () =>
        this.companyApiService
          .resendInvitation(activeUser.companyId, activeUser.userId)
          .subscribe(() => {
            this.listRefresher$.next();
            this.openChangesSavedToast();
          }),
    });
  }

  private removeUser(activeUser: CompanyUser): void {
    this.confirmationService.confirm({
      confirmDialogType: this.removeUserConfirmDialogKey,
      message: this.translateService.instant('COMPANY_USER_ACCOUNTS.CONFIRM_USER_ACCOUNT_REMOVAL', {
        email: activeUser.email,
      }),
      accept: () =>
        this.companyApiService.removeUser(activeUser.companyId, activeUser.userId).subscribe(() => {
          this.listRefresher$.next();
          this.openChangesSavedToast();
        }),
    } as Confirmation);
  }

  private updateUserAccountAccessRole(activeUser: CompanyUser): void {
    const isLimitingUserAccess = activeUser.role === UserRole.COMPANY_USER;
    const confirmationMessage = isLimitingUserAccess
      ? 'COMPANY_USER_ACCOUNTS.CONFIRM_USER_ACCOUNT_LIMIT_ACCESS_CHANGE'
      : 'COMPANY_USER_ACCOUNTS.CONFIRM_USER_ACCOUNT_EXPAND_ACCESS_CHANGE';

    this.confirmationService.confirm({
      message: this.translateService.instant(confirmationMessage, { email: activeUser.email }),
      accept: () =>
        this.companyApiService
          .updateUserAccess(activeUser.companyId, activeUser.userId, {
            role: isLimitingUserAccess ? UserRole.GROUP_USER : UserRole.COMPANY_USER,
            accessGroups: [],
          })
          .subscribe(updatedUserAccount => {
            this.listRefresher$.next();
            this.openChangesSavedToast();
            if (isLimitingUserAccess) {
              this.openAssignGroupsDialog(updatedUserAccount);
            }
          }),
    });
  }

  private resetUserAccount(activeUser: CompanyUser): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('COMPANY_USER_ACCOUNTS.CONFIRM_USER_ACCOUNT_RESET', {
        email: activeUser.email,
      }),
      accept: () =>
        this.authApiService
          .resetPassword(activeUser.email)
          .subscribe(() => this.openChangesSavedToast()),
    });
  }

  private openChangesSavedToast(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.translateService.instant('GENERAL.CHANGES_SAVED'),
    });
  }
}
