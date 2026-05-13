import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { debounceTime, distinctUntilChanged, filter, startWith, switchMap, take, tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { DateTime } from 'luxon';

import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { MenuModule } from 'primeng/menu';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ChipModule } from 'primeng/chip';
import { TagModule } from 'primeng/tag';
import { Popover } from 'primeng/popover';
import { PaginatorModule } from 'primeng/paginator';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogService } from 'primeng/dynamicdialog';

import { AppRouteEnum } from 'src/app/app.routes.model';
import { RootState, AuthStore } from '@dps/core/store';
import { CompanyGroupApiService, EmployeeApiService } from '@dps/core/api';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';
import { EmployeeGroupEngagement, EmployeeModel, Group, UserRole } from '@dps/shared/models';
import {
  EmployeeMyStafflerStatus,
  MyStafflerInviteModel,
  MystafflerInviteApiService,
} from '@dps/core/api/mystaffler-invite/mystaffler-invite.api.service';
import {
  AssignGroupsDialogComponent,
  AssignGroupsDialogData,
} from '@dps/shared/components';

type StatusFilter = 'all' | EmployeeMyStafflerStatus;

interface PoolRow {
  /** Subset used for display; assignment uses the full record below. */
  employee: EmployeeModel | EmployeeGroupEngagement;
  /** Full engagement record (id + firstName + lastName + engagementGroups). */
  engagement: EmployeeGroupEngagement;
  assignedGroups: Group[];
  status: EmployeeMyStafflerStatus;
  lastLoginAt: string | null;
  invitedAt: string | null;
}

/**
 * BCJ-19425 — Pool overview & MyStaffler invite management.
 *
 * The page is the employer-facing list of all employees in the company's pool.
 * Mockup 15 (`mockups/15-pool-mystaffler.html`) is the source of truth.
 *
 *  - Three filter buttons across the top: MyStaffler inactive / active /
 *    pending (Uitgenodigd). "Alle" is the default.
 *  - Columns: Employee | Assigned vestigingen (groups, only for group users)
 *    | MyStaffler account | Last login | Actions.
 *  - MyStaffler-account cell: blue "Uitnodigen" button when no account, amber
 *    "Uitnodiging verstuurd" badge when invited, green "Account actief"
 *    when accepted.
 *  - Last-login cell: ISO timestamp or muted italic "Nooit ingelogd".
 *  - Actions menu (three-dot):
 *      * Active account → Toewijzen aan vestiging + Wachtwoord resetten +
 *        Account naar actief (demo-only)
 *      * Invited        → Toewijzen aan vestiging + Uitnodiging opnieuw +
 *        Account naar actief (demo-only)
 *      * No account     → Toewijzen aan vestiging + Uitnodigen
 *
 * "Last login" + invite/account status come from the PoC-DB
 * mystaffler_invites table; v1 will pull them from the real Staffler
 * endpoint when BE adds it.
 */
@Component({
  selector: 'dps-pool',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    TableModule,
    TooltipModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    MenuModule,
    ToastModule,
    ChipModule,
    TagModule,
    Popover,
    PaginatorModule,
    ConfirmDialogModule,
  ],
  providers: [MessageService, DialogService, ConfirmationService],
  templateUrl: './pool.component.html',
  styleUrl: './pool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-4 gap-3' },
})
export class PoolComponent {
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly invitesApi = inject(MystafflerInviteApiService);
  private readonly groupsApi = inject(CompanyGroupApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly dialogService = inject(DialogService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly authStore = inject(AuthStore);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly statusFilter = signal<StatusFilter>('all');
  /** Vestigingen list shown in the "Locaties bekijken" popover. */
  protected readonly branches = signal<EngagementGroupModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly rows = signal<PoolRow[]>([]);
  /** Per-row context for the per-row 3-dot menu (set on open). */
  protected readonly currRow = signal<PoolRow | null>(null);
  /** New-vestiging popover form. */
  protected readonly newBranchNameControl = new FormControl<string>('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });
  protected readonly creatingBranch = signal(false);
  protected readonly company = this.store.selectSignal(RootState.getCompanyData);
  protected readonly hasGroupColumn = computed(() =>
    this.authStore.hasRoles([UserRole.GROUP_USER, UserRole.COMPANY_USER]),
  );

  protected readonly counts = computed(() => {
    const rows = this.rows();
    return {
      all: rows.length,
      inactive: rows.filter(r => r.status === 'inactive').length,
      invited: rows.filter(r => r.status === 'invited').length,
      active: rows.filter(r => r.status === 'active').length,
    };
  });

  protected readonly filtered = computed(() => {
    const status = this.statusFilter();
    const rows = this.rows();
    if (status === 'all') return rows;
    return rows.filter(r => r.status === status);
  });

  // Debounced search reload.
  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(this.searchControl.value),
      tap(() => this.refresh()),
    ),
    { initialValue: '' },
  );

  constructor() {
    // Initial load once the company context is available.
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => {
        this.refresh();
        // Pre-load the vestigingen list so the "Locaties bekijken" popover
        // opens instantly without a network roundtrip on click.
        this.engagementGroupsApi.listForCompany(company.id).subscribe({
          next: rows => {
            this.branches.set(rows ?? []);
            this.cdr.markForCheck();
          },
          error: () => this.branches.set([]),
        });
      });
  }

  protected setFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
  }

  protected refresh(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;
    this.loading.set(true);

    const nameLike = this.searchControl.value?.trim() || undefined;

    // Use the engagement-groups endpoint so each row carries its assigned
    // vestigingen — needed both for the "Toegewezen vestigingen" column and
    // for the AssignGroupsDialog's existingGroups data.
    this.groupsApi
      .getEmployeeGroupEngagements(company.id, {
        nameLike,
        page: 0,
        size: 100,
      } as Parameters<CompanyGroupApiService['getEmployeeGroupEngagements']>[1])
      .pipe(
        switchMap(page =>
          this.invitesApi
            .list(company.id)
            .pipe(switchMap(invites => Promise.resolve(this.mergeRows(page?.content ?? [], invites)))),
        ),
      )
      .subscribe({
        next: rows => {
          this.rows.set(rows);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  private mergeRows(
    engagements: EmployeeGroupEngagement[],
    invites: MyStafflerInviteModel[],
  ): PoolRow[] {
    const inviteByEmployee = new Map<string, MyStafflerInviteModel>();
    for (const i of invites) inviteByEmployee.set(i.employee_id, i);
    return engagements.map(eng => {
      const invite = inviteByEmployee.get(eng.id);
      const status: EmployeeMyStafflerStatus =
        invite?.status === 'active'
          ? 'active'
          : invite?.status === 'invited'
            ? 'invited'
            : 'inactive';
      return {
        employee: eng,
        engagement: eng,
        assignedGroups: eng.engagementGroups ?? [],
        status,
        invitedAt: invite?.invited_at ?? null,
        lastLoginAt: invite?.last_login_at ?? null,
      };
    });
  }

  protected formatLastLogin(iso: string | null): string {
    if (!iso) return '';
    const d = DateTime.fromISO(iso).setLocale('nl-BE');
    if (!d.isValid) return iso;
    return d.toFormat("d/M/yyyy, HH:mm");
  }

  protected employeeName(emp: EmployeeModel | EmployeeGroupEngagement): string {
    return `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || emp.id;
  }

  protected goToProfile(emp: EmployeeModel | EmployeeGroupEngagement): void {
    this.router.navigate([AppRouteEnum.EMPLOYEE, emp.id, 'profile']);
  }

  protected invite(row: PoolRow): void {
    const company = this.company();
    if (!company) return;
    this.invitesApi.invite(row.employee.id, company.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Uitnodiging verstuurd',
          detail: this.employeeName(row.employee),
        });
        this.refresh();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Uitnodigen mislukt',
          detail: this.parseError(err),
        });
      },
    });
  }

  protected resendInvite(row: PoolRow): void {
    const company = this.company();
    if (!company) return;
    this.invitesApi.resend(row.employee.id, company.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Uitnodiging opnieuw verstuurd',
          detail: this.employeeName(row.employee),
        });
        this.refresh();
      },
      error: err => {
        this.messageService.add({
          severity: 'error',
          summary: 'Opnieuw versturen mislukt',
          detail: this.parseError(err),
        });
      },
    });
  }

  protected markActive(row: PoolRow): void {
    const company = this.company();
    if (!company) return;
    this.invitesApi.markActive(row.employee.id, company.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: 'Account naar actief (demo)',
          detail: this.employeeName(row.employee),
        });
        this.refresh();
      },
    });
  }

  protected assignGroups(row: PoolRow): void {
    const company = this.company();
    if (!company) return;
    const ref = this.dialogService.open(AssignGroupsDialogComponent, {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      width: '32rem',
      data: {
        headerTitle: `Wijs vestigingen toe aan ${this.employeeName(row.engagement)}`,
        existingGroups: row.engagement.engagementGroups ?? [],
      } satisfies AssignGroupsDialogData,
    });
    ref.onClose.subscribe((selectedGroups: Group[] | undefined) => {
      if (!selectedGroups) return;
      this.groupsApi
        .updateEmployeeGroups(company.id, row.engagement.id, selectedGroups)
        .subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Vestigingen bijgewerkt',
              detail: this.employeeName(row.engagement),
            });
            this.refresh();
          },
          error: err =>
            this.messageService.add({
              severity: 'error',
              summary: 'Toewijzen mislukt',
              detail: this.parseError(err),
            }),
        });
    });
  }

  /**
   * Builds the per-row Action menu items based on the employee's status.
   * Mockup 15 spec: "Vestigingen toewijzen" + "Wachtwoord resetten".
   * We keep two PoC-only extras gated by status (resend invite / mark
   * active for demo) so the pilot operator has a way to test the invite
   * flow without rebuilding the seed.
   */
  protected menuItemsFor(row: PoolRow): MenuItem[] {
    const items: MenuItem[] = [
      {
        label: 'Vestigingen toewijzen',
        icon: 'dps-icon dps-icon-building',
        command: () => this.assignGroups(row),
      },
      {
        label: 'Wachtwoord resetten',
        icon: 'dps-icon dps-icon-lock',
        command: () =>
          this.messageService.add({
            severity: 'info',
            summary: 'Wachtwoord reset',
            detail: 'TODO — wire to /api/users/:id/reset-password.',
          }),
      },
    ];
    if (row.status === 'invited') {
      items.push({
        label: 'Uitnodiging opnieuw versturen',
        icon: 'dps-icon dps-icon-double_arrow_right',
        command: () => this.resendInvite(row),
      });
    }
    if (row.status !== 'active') {
      items.push({
        label: 'Account naar actief (demo)',
        icon: 'dps-icon dps-icon-check',
        command: () => this.markActive(row),
      });
    }
    return items;
  }

  // ── Vestigingen popover (create / rename / remove) ──────────────────────

  /** Reload the vestigingen list (used after a CRUD action). */
  private reloadBranches(): void {
    const company = this.company();
    if (!company) return;
    this.engagementGroupsApi.listForCompany(company.id).subscribe({
      next: rows => {
        this.branches.set(rows ?? []);
        this.cdr.markForCheck();
      },
      error: () => this.branches.set([]),
    });
  }

  protected createBranch(popover: Popover): void {
    if (this.newBranchNameControl.invalid) return;
    const company = this.company();
    if (!company) return;
    this.creatingBranch.set(true);
    this.groupsApi
      // CreateGroupModel extends Group; the backend only needs name +
      // company. We supply enough fields to satisfy the type and let DPS
      // fill the id / etc. server-side.
      .createGroup(company.id, {
        id: '',
        name: this.newBranchNameControl.value.trim(),
        companyId: company.id,
        employees: [],
      } as never)
      .subscribe({
        next: () => {
          this.creatingBranch.set(false);
          this.newBranchNameControl.reset();
          popover.hide();
          this.reloadBranches();
          this.refresh();
          this.messageService.add({
            severity: 'success',
            summary: 'Vestiging toegevoegd',
          });
        },
        error: err => {
          this.creatingBranch.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Aanmaken vestiging mislukt',
            detail: this.parseError(err),
          });
        },
      });
  }

  protected renameBranchPrompt(branch: EngagementGroupModel): void {
    const newName = window.prompt('Nieuwe naam voor de vestiging', branch.name);
    if (!newName || newName.trim() === branch.name) return;
    this.groupsApi
      .updateGroup({ ...(branch as unknown as Group), name: newName.trim() })
      .subscribe({
        next: () => {
          this.reloadBranches();
          this.refresh();
          this.messageService.add({
            severity: 'success',
            summary: 'Vestiging hernoemd',
          });
        },
        error: err =>
          this.messageService.add({
            severity: 'error',
            summary: 'Hernoemen mislukt',
            detail: this.parseError(err),
          }),
      });
  }

  protected removeBranchPrompt(branch: EngagementGroupModel): void {
    const company = this.company();
    if (!company) return;
    this.confirmationService.confirm({
      message: `Vestiging "${branch.name}" verwijderen? Medewerkers verliezen hun toewijzing.`,
      acceptLabel: 'Verwijderen',
      rejectLabel: 'Annuleren',
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        this.groupsApi.removeGroup(company.id, branch.id).subscribe({
          next: () => {
            this.reloadBranches();
            this.refresh();
            this.messageService.add({
              severity: 'success',
              summary: 'Vestiging verwijderd',
            });
          },
          error: err =>
            this.messageService.add({
              severity: 'error',
              summary: 'Verwijderen mislukt',
              detail: this.parseError(err),
            }),
        });
      },
    });
  }

  private parseError(err: unknown): string {
    const e = err as { error?: { message?: string; errors?: { details?: string }[] } } | undefined;
    return e?.error?.message ?? e?.error?.errors?.[0]?.details ?? 'Onbekende fout';
  }
}
