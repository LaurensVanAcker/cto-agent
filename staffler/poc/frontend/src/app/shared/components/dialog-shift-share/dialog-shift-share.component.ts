import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
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
import { EmployeeWageApiService } from '@dps/core/api/employee-wage/employee-wage.api.service';
import { EmployeeModel } from '@dps/shared/models';
import {
  ShiftApiService,
  ShiftModel,
  ShiftTargetType,
} from '@dps/core/api/shift/shift.api.service';
import { AvailabilityApiService } from '@dps/core/api/availability/availability.api.service';

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
  private readonly availabilityApi = inject(AvailabilityApiService);
  private readonly wagesApi = inject(EmployeeWageApiService);
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
   * Mockup 06 "+ Beschikbaar deze week" filter — set of employee ids
   * who have at least one open availability row in the visible week.
   * Filled lazily on dialog open. Empty until the availability call
   * lands so the toggle is a no-op rather than hiding everyone.
   */
  protected readonly availableEmployeeIds = signal<Set<string>>(new Set());
  protected readonly onlyAvailable = signal<boolean>(false);

  /** Filtered list rendered in the name picker. When the
   *  "Beschikbaar deze week" toggle is on we narrow `poolContent` to
   *  employees in `availableEmployeeIds`. */
  protected readonly visiblePool = computed<EmployeeModel[]>(() => {
    const all = this.poolContent();
    if (!this.onlyAvailable()) return all;
    const set = this.availableEmployeeIds();
    return all.filter(e => set.has(e.id));
  });

  protected readonly availableCount = computed<number>(() => {
    const set = this.availableEmployeeIds();
    return this.poolContent().filter(e => set.has(e.id)).length;
  });

  /**
   * Cache of the most-recent wage statute name per employee id. Drives
   * the inline "laatst gebruikt statuut" chip in the Specifieke namen
   * picker — operator needs this to decide who's the right person to
   * broadcast a shift to (e.g. send a Flexijob shift only to flexi
   * statuten). Lazy-fetched on first render of each visible employee,
   * mirrored from `dialog-shift-select-fullscreen` so the two surfaces
   * share the same recall semantics.
   *
   * `null` value = fetched but the employee has no wage row yet
   * (chip stays hidden). `undefined`/missing = not yet fetched.
   *
   * Regression 2026-05-18: pilot reported the chip was missing in
   * "Specifieke namen" — the inline picker rendered only the name. The
   * fullscreen variant has the chip but isn't wired in everywhere, so
   * we restore the recall directly on the inline picker too.
   */
  protected readonly statuteByEmployeeId = signal<Map<string, string | null>>(
    new Map(),
  );
  private readonly statuteRequested = new Set<string>();

  constructor() {
    // Preload availability ids for the visible week so the "+ Beschikbaar
    // deze week" chip in the SELECTION mode can filter immediately. Falls
    // back to an empty set if the call fails — the toggle just becomes
    // a no-op then. Single shot per dialog open: pool size in the PoC is
    // small and the week doesn't change inside the dialog.
    if (this.companyId && this.weekIso) {
      const monday = DateTime.fromISO(this.weekIso);
      const sunday = monday.plus({ days: 6 });
      this.availabilityApi
        .listForCompany(
          this.companyId,
          monday.toISODate() ?? undefined,
          sunday.toISODate() ?? undefined,
        )
        .pipe(take(1))
        .subscribe({
          next: rows => {
            const ids = new Set<string>();
            for (const r of rows) if (r.status === 'open') ids.add(r.employee_id);
            this.availableEmployeeIds.set(ids);
            this.cdr.markForCheck();
          },
          error: () => {
            // Empty set is a safe default — the toggle stays a no-op.
          },
        });
    }

    // Lazy-fetch the most-recent wage statute for every employee that
    // becomes visible in the picker. The chip lives inline next to the
    // name (Specifieke namen) — without this lookup the operator has
    // to guess who is on which statuut. One request per id, deduped
    // via `statuteRequested`. Failures still mark the id "done" so we
    // don't retry on every re-render.
    effect(() => {
      const pool = this.poolContent();
      if (!this.companyId || pool.length === 0) return;
      for (const emp of pool) {
        if (this.statuteRequested.has(emp.id)) continue;
        this.statuteRequested.add(emp.id);
        this.wagesApi
          .getEmployeeWages({
            companyId: this.companyId,
            employeeId: emp.id,
            page: 0,
            size: 1,
          })
          .pipe(take(1))
          .subscribe({
            next: rows => {
              const name = rows?.[0]?.statute?.name ?? null;
              this.statuteByEmployeeId.update(m => {
                const next = new Map(m);
                next.set(emp.id, name);
                return next;
              });
              this.cdr.markForCheck();
            },
            error: () => {
              this.statuteByEmployeeId.update(m => {
                const next = new Map(m);
                next.set(emp.id, null);
                return next;
              });
            },
          });
      }
    });
  }

  /** Lookup helper for the template — returns the last-used statute
   *  name for an employee, or `null` while loading / when the
   *  employee has no wage row yet. */
  protected statuteFor(emp: EmployeeModel): string | null {
    return this.statuteByEmployeeId().get(emp.id) ?? null;
  }

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
    // Respect the current "Beschikbaar deze week" filter — selecting "all"
    // while the filter is on should only add the visible (available) rows.
    this.selectedIds.set(new Set(this.visiblePool().map(e => e.id)));
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  /**
   * Mockup 06 chip: "+ Beschikbaar deze week (N)". One click bulk-adds
   * every employee who has at least one open availability in the visible
   * week to the selection (additive — does not deselect anyone). Hidden
   * when the count is 0 to avoid surfacing an empty action.
   */
  protected addAllAvailable(): void {
    const ids = this.availableEmployeeIds();
    if (ids.size === 0) return;
    this.selectedIds.update(set => {
      const next = new Set(set);
      for (const id of ids) next.add(id);
      return next;
    });
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
