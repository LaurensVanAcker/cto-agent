import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DateTime } from 'luxon';
import { combineLatest, debounceTime, filter, of, startWith, switchMap, take } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { InputTextModule } from 'primeng/inputtext';
import { RadioButtonModule } from 'primeng/radiobutton';

import { EmployeeApiService } from '@dps/core/api';
import { EmployeeModel } from '@dps/shared/models';
import {
  ShiftApiService,
  ShiftModel,
  ShiftTargetType,
} from '@dps/core/api/shift/shift.api.service';

type ShareTarget = 'ALL_POOL' | 'SELECTION' | 'PARTNERS';

interface DialogData {
  companyId: string;
  weekIso: string;
  shifts: ShiftModel[];
}

/**
 * Open shifts delen (mockup 12).
 *
 * Operator selects between three broadcast strategies for the open shifts
 * in the current week:
 *
 *  - **Volledige pool** — every employee in the pool sees the shifts
 *  - **Specifieke namen** — only the checked employees see them
 *  - **Uitsturen naar partners** — pushes to external staffing partners
 *    (Jobfixers / Randstad / Trixxo); PoC just records the choice, no
 *    integration with the partner APIs yet.
 *
 * A deadline override (date + time) applies to every shift in the batch.
 * On confirm we POST one update per shift to the PoC-DB so the planning
 * grid immediately reflects the new target + deadline.
 *
 * Vaste medewerkers are intentionally excluded — open shifts are about
 * filling temp/casual slots.
 */
@Component({
  selector: 'dps-dialog-shift-share',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    RadioButtonModule,
  ],
  templateUrl: './dialog-shift-share.component.html',
  styleUrl: './dialog-shift-share.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DialogShiftShareComponent {
  private readonly ref = inject(DynamicDialogRef);
  private readonly config: DynamicDialogConfig<DialogData> = inject(DynamicDialogConfig);
  private readonly employeesApi = inject(EmployeeApiService);
  private readonly shiftsApi = inject(ShiftApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly companyId = this.config.data?.companyId ?? '';
  protected readonly weekIso = this.config.data?.weekIso ?? '';
  protected readonly shifts = this.config.data?.shifts ?? [];

  protected readonly target = signal<ShareTarget>('ALL_POOL');

  /** Single datetime-local input mirrors the new-shift dialog. Default
   *  matches: next Sunday at 21:00. */
  private defaultDeadlineLocal(): string {
    const now = DateTime.now();
    const sunday = now.set({ weekday: 7, hour: 21, minute: 0, second: 0 });
    const target = sunday > now ? sunday : sunday.plus({ weeks: 1 });
    return target.toFormat("yyyy-MM-dd'T'HH:mm");
  }
  protected readonly deadlineLocal = signal<string>(this.defaultDeadlineLocal());
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly nameFilter = new FormControl<string>('', { nonNullable: true });
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Live-search the pool (companyId scoped, debounced).
   *  We never list more than 100 — the mockup expects a scrollable list
   *  and pilot pools cap out around 30–40 employees anyway. */
  private readonly nameFilter$ = this.nameFilter.valueChanges.pipe(
    startWith(this.nameFilter.value),
    debounceTime(200),
  );
  protected readonly pool = toSignal(
    combineLatest([of(this.companyId), this.nameFilter$]).pipe(
      filter(([cid]) => !!cid),
      switchMap(([cid, nameLike]) =>
        this.employeesApi.getEmployees({
          companyId: cid,
          nameLike: nameLike?.trim() || undefined,
          baseView: true,
          page: 0,
          size: 100,
        }),
      ),
    ),
    { initialValue: undefined },
  );

  protected readonly poolSize = computed(() => this.pool()?.totalElements ?? 0);
  protected readonly poolContent = computed(() => this.pool()?.content ?? []);
  protected readonly selectionCount = computed(() => this.selectedIds().size);

  /**
   * Header subtitle: "in week 19 (4 mei – 10 mei 2026)". Computed from
   * `weekIso` (Monday of the visible week) using Luxon's locale-aware
   * formatters so the month names match the rest of the planning chrome
   * (nl-BE).
   */
  protected readonly weekRangeLabel = computed<string>(() => {
    if (!this.weekIso) return '';
    const monday = DateTime.fromISO(this.weekIso).setLocale('nl-BE');
    if (!monday.isValid) return '';
    const sunday = monday.plus({ days: 6 });
    const week = monday.weekNumber;
    const left = monday.toFormat('d LLL');
    const right = sunday.toFormat('d LLL yyyy');
    return `in week ${week} (${left} – ${right})`;
  });

  /** Footer counter — 28 medewerkers / 4 medewerkers / partners. */
  protected readonly recipientCount = computed(() => {
    switch (this.target()) {
      case 'ALL_POOL':
        return this.poolSize();
      case 'SELECTION':
        return this.selectionCount();
      case 'PARTNERS':
        // Partners are not "medewerkers"; surface the three known ones.
        return 3;
    }
  });

  protected isChecked(emp: EmployeeModel): boolean {
    return this.selectedIds().has(emp.id);
  }

  protected toggle(emp: EmployeeModel, checked: boolean): void {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (checked) next.add(emp.id);
      else next.delete(emp.id);
      return next;
    });
  }

  protected selectAll(): void {
    this.selectedIds.set(new Set(this.poolContent().map(e => e.id)));
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  protected cancel(): void {
    this.ref.close();
  }

  protected canSend(): boolean {
    if (this.saving()) return false;
    if (this.shifts.length === 0) return false;
    if (this.target() === 'SELECTION' && this.selectedIds().size === 0) return false;
    return true;
  }

  /**
   * Push the chosen target / deadline to every open shift in the batch.
   * We call `share()` per shift sequentially-with-take(1) — pilot batches
   * are small (8 shifts in the mockup), so this is fine without a custom
   * bulk endpoint and the operator sees a single success toast.
   */
  protected send(): void {
    if (!this.canSend()) return;
    this.saving.set(true);
    this.error.set(null);
    const targetType: ShiftTargetType =
      this.target() === 'PARTNERS' ? 'PARTNERS' : (this.target() as ShiftTargetType);
    const targetEmployeeIds =
      this.target() === 'SELECTION' ? Array.from(this.selectedIds()) : undefined;
    const deadlineIso = this.parseDeadline();

    const payload = {
      targetType,
      targetEmployeeIds,
      reactionDeadline: deadlineIso,
    };

    let remaining = this.shifts.length;
    let failed = 0;
    for (const shift of this.shifts) {
      this.shiftsApi
        .share(shift.id, payload)
        .pipe(take(1))
        .subscribe({
          next: () => {
            remaining--;
            if (remaining === 0) this.finish(failed);
          },
          error: () => {
            remaining--;
            failed++;
            if (remaining === 0) this.finish(failed);
          },
        });
    }
  }

  private finish(failed: number): void {
    this.saving.set(false);
    if (failed > 0) {
      this.error.set(`${failed} shift(s) konden niet bijgewerkt worden.`);
      this.cdr.markForCheck();
      return;
    }
    this.ref.close({
      kind: 'shift.share.success',
      recipientCount: this.recipientCount(),
    });
  }

  /** "2026-05-06T18:00" → ISO datetime, falsy if invalid. */
  private parseDeadline(): string | undefined {
    const raw = this.deadlineLocal();
    if (!raw) return undefined;
    const iso = DateTime.fromISO(raw);
    return iso.isValid ? iso.toISO() ?? undefined : undefined;
  }
}
