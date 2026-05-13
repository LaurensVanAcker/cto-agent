import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogService } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';

import { DateTime } from 'luxon';
import { Store } from '@ngxs/store';

import { ContractConfirmationApiService } from '@dps/core/api';
import { LoadActualsCount, RootState } from '@dps/core/store';
import {
  ContractConfirmation,
  ContractConfirmationDaySchedule,
  ContractConfirmationStatus,
} from '@dps/shared/models';
import { DialogConfirmActualComponent } from '@dps/shared/components/dialog-confirm-actual/dialog-confirm-actual.component';

type StatusFilter = 'pending' | 'all';

/**
 * Prestatiebevestiging — list + confirm flow.
 *
 * Replaces the previous iframe wrapper. The PoC now owns the UI; the API
 * stays at DPS via `ContractConfirmationApiService`. Listing comes from
 * GET /companies/:id/actuals; per-row confirmation goes through
 * PATCH /companies/:id/actuals/:id/workTimes.
 *
 * Mockup-aligned layout: filter pills on top (Pending / All), then a
 * stack of cards — one per pending contract with employee + date range +
 * "Bevestigen" CTA. Clicking opens `DialogConfirmActualComponent` where
 * the operator reviews each day and confirms or marks absent.
 */
@Component({
  selector: 'dps-company-actuals',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CardModule,
    ChipModule,
    DatePickerModule,
    ProgressSpinnerModule,
    SelectButtonModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [DialogService, MessageService],
  templateUrl: './company-actuals.component.html',
  styleUrl: './company-actuals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-3 gap-3' },
})
export class CompanyActualsComponent {
  private readonly store = inject(Store);
  private readonly api = inject(ContractConfirmationApiService);
  private readonly dialogService = inject(DialogService);
  private readonly messageService = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly company = this.store.selectSignal(RootState.getCompanyData);

  protected readonly statusFilter = signal<StatusFilter>('pending');
  protected readonly statusOptions = [
    { label: 'Te bevestigen', value: 'pending' as StatusFilter },
    { label: 'Alles', value: 'all' as StatusFilter },
  ];

  protected readonly loading = signal<boolean>(false);
  protected readonly rows = signal<ContractConfirmation[]>([]);
  protected readonly fetchError = signal<string | null>(null);

  /**
   * Default range = last 2 weeks (most pilots want to see the just-ended
   * shifts they still have to confirm). Operator can tweak via the date
   * pickers in the header.
   */
  protected readonly startDate = signal<Date>(
    DateTime.now().minus({ weeks: 2 }).startOf('day').toJSDate(),
  );
  protected readonly endDate = signal<Date>(
    DateTime.now().endOf('day').toJSDate(),
  );

  protected readonly filteredRows = computed<ContractConfirmation[]>(() => {
    const rows = this.rows();
    if (this.statusFilter() !== 'pending') return rows;
    // "Te bevestigen" = at least one day-schedule still PENDING/OVERDUE.
    return rows.filter(row =>
      row.workTime.some(
        d =>
          d.status === ContractConfirmationStatus.PENDING ||
          d.status === ContractConfirmationStatus.OVERDUE,
      ),
    );
  });

  protected readonly pendingCount = computed<number>(() =>
    this.rows().reduce((acc, row) => {
      const has = row.workTime.some(
        d =>
          d.status === ContractConfirmationStatus.PENDING ||
          d.status === ContractConfirmationStatus.OVERDUE,
      );
      return acc + (has ? 1 : 0);
    }, 0),
  );

  constructor() {
    // Initial fetch — kicked off as soon as the company is hydrated. We
    // use selectSignal which fires synchronously when the value is
    // already in the store (typical for nav from the planning surface).
    queueMicrotask(() => this.fetch());
  }

  protected setStatusFilter(value: StatusFilter): void {
    this.statusFilter.set(value);
  }

  protected refresh(): void {
    this.fetch();
  }

  protected back(): void {
    const c = this.company();
    if (!c) {
      this.router.navigateByUrl('/');
      return;
    }
    this.router.navigate(['..', 'planning-poc'], { relativeTo: this.route });
  }

  /**
   * Status pill copy for a row — summarises the worst day-status so the
   * operator sees "Te bevestigen" / "Bevestigd" / "Te laat" at a glance.
   */
  protected rowStatusLabel(row: ContractConfirmation): {
    label: string;
    cls: string;
  } {
    const days = row.workTime;
    if (days.some(d => d.status === ContractConfirmationStatus.OVERDUE)) {
      return { label: 'Te laat', cls: 'status-overdue' };
    }
    if (days.some(d => d.status === ContractConfirmationStatus.PENDING)) {
      return { label: 'Te bevestigen', cls: 'status-pending' };
    }
    if (days.some(d => d.status === ContractConfirmationStatus.ABSENT)) {
      return { label: 'Afwezig', cls: 'status-absent' };
    }
    if (
      days.length > 0 &&
      days.every(d => d.status === ContractConfirmationStatus.CONFIRMED)
    ) {
      return { label: 'Bevestigd', cls: 'status-confirmed' };
    }
    return { label: 'Geannuleerd', cls: 'status-cancelled' };
  }

  protected dateRangeLabel(row: ContractConfirmation): string {
    const from = DateTime.fromISO(row.dateFrom).setLocale('nl-BE');
    const to = DateTime.fromISO(row.dateTo).setLocale('nl-BE');
    if (!from.isValid || !to.isValid) return '';
    if (from.hasSame(to, 'day')) {
      return from.toFormat('cccc d LLLL yyyy');
    }
    return `${from.toFormat('d LLL')} – ${to.toFormat('d LLL yyyy')}`;
  }

  /**
   * Open the confirm-actual modal — a per-day editor for one
   * ContractConfirmation. Saved workTime patches go through the
   * existing PATCH /actuals/:id/workTimes endpoint.
   */
  protected openConfirm(row: ContractConfirmation): void {
    const company = this.company();
    if (!company) return;
    const ref = this.dialogService.open(DialogConfirmActualComponent, {
      showHeader: false,
      modal: true,
      width: '42rem',
      data: { confirmation: row, companyId: company.id },
    });
    ref.onClose.subscribe(result => {
      if (result?.kind === 'actual.saved') {
        this.messageService.add({
          severity: 'success',
          summary: 'Prestatie bevestigd',
          detail: `${this.dateRangeLabel(row)} — ${row.position}`,
        });
        this.fetch();
        // Refresh the sidebar badge — the global pending count should
        // drop by one after this confirmation lands.
        this.store.dispatch(new LoadActualsCount());
      }
    });
  }

  /**
   * Background fetch — uses pending+overdue statuses by default since
   * the "Alles" filter is purely client-side (saves an extra round-trip
   * when the operator toggles).
   */
  private fetch(): void {
    const company = this.company();
    if (!company) return;
    this.loading.set(true);
    this.fetchError.set(null);
    this.api
      .getContractsConfirmations({
        companyId: company.id,
        startDate: DateTime.fromJSDate(this.startDate()).toISODate() ?? undefined,
        endDate: DateTime.fromJSDate(this.endDate()).toISODate() ?? undefined,
        page: 0,
        size: 100,
      })
      .subscribe({
        next: page => {
          this.rows.set(page.content ?? []);
          this.loading.set(false);
        },
        error: err => {
          this.rows.set([]);
          this.loading.set(false);
          // Surface the DPS error so the operator knows it's not "no
          // prestaties" — the call actually failed. Most likely a 401
          // (refresh login) or 5xx (DPS hiccup).
          const status = (err as { status?: number })?.status;
          this.fetchError.set(
            status === 401
              ? 'Sessie verlopen. Log opnieuw in om door te gaan.'
              : 'Prestaties ophalen mislukt. Probeer het opnieuw.',
          );
          this.messageService.add({
            severity: 'error',
            summary: 'Prestaties ophalen mislukt',
            detail: `HTTP ${status ?? '?'}`,
          });
        },
      });
  }
}
