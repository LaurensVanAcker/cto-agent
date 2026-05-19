import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import { filter, take } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '@dps/env';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';

import { RootState } from '@dps/core/store';
import {
  CreateServiceLocationPayload,
  ServiceLocationApiService,
  ServiceLocationModel,
  OpeningHours,
  OpeningHoursDay,
} from '@dps/core/api/service-location/service-location.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';

type WeekDay = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const WEEKDAYS: ReadonlyArray<{ id: WeekDay; short: string; long: string }> = [
  { id: 1, short: 'Ma', long: 'maandag' },
  { id: 2, short: 'Di', long: 'dinsdag' },
  { id: 3, short: 'Wo', long: 'woensdag' },
  { id: 4, short: 'Do', long: 'donderdag' },
  { id: 5, short: 'Vr', long: 'vrijdag' },
  { id: 6, short: 'Za', long: 'zaterdag' },
  { id: 7, short: 'Zo', long: 'zondag' },
];

interface ServiceLocationForm {
  id: string | null;
  name: string;
  branchGroupId: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  /** Mutable working copy of OpeningHours used by the per-weekday editor.
   *  Missing entries are treated as "gesloten". */
  openingHours: Record<WeekDay, OpeningHoursDay | null>;
}

function emptyOpeningHours(): Record<WeekDay, OpeningHoursDay | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
}

function emptyForm(): ServiceLocationForm {
  return {
    id: null,
    name: '',
    branchGroupId: '',
    addressLine1: '',
    postalCode: '',
    city: '',
    openingHours: emptyOpeningHours(),
  };
}

/**
 * Beheer locaties — admin view for the PoC-DB service_locations table.
 * Mockup 14 (`mockups/14-locatie-eigenschappen.html`) is the source of
 * truth. Vestigingen come from DPS (read-only); service locations are
 * stored in the Fastify proxy's PoC-DB.
 */
@Component({
  selector: 'dps-company-locations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TooltipModule,
  ],
  templateUrl: './company-locations.component.html',
  styleUrl: './company-locations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-4 gap-3' },
})
export class CompanyLocationsComponent {
  private readonly serviceLocationsApi = inject(ServiceLocationApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly branches = signal<EngagementGroupModel[]>([]);
  protected readonly serviceLocations = signal<ServiceLocationModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected form: ServiceLocationForm = emptyForm();

  protected readonly branchOptions = computed(() =>
    this.branches().map(b => ({ label: b.name ?? b.id, value: b.id })),
  );

  protected readonly branchNameById = computed(() => {
    const map = new Map<string, string>();
    for (const b of this.branches()) map.set(b.id, b.name ?? b.id);
    return map;
  });

  constructor() {
    this.store
      .select(RootState.getCompanyData)
      .pipe(filter(Boolean), take(1))
      .subscribe(company => this.refreshAll(company.id));
  }

  protected branchName(id: string): string {
    return this.branchNameById().get(id) ?? id;
  }

  protected openCreate(): void {
    this.form = emptyForm();
    this.dialogVisible.set(true);
  }

  protected openEdit(row: ServiceLocationModel): void {
    const oh = row.opening_hours ?? {};
    const filled: Record<WeekDay, OpeningHoursDay | null> = emptyOpeningHours();
    for (const wd of [1, 2, 3, 4, 5, 6, 7] as const) {
      const entry = oh[wd];
      if (entry && typeof entry.from === 'string' && typeof entry.to === 'string') {
        filled[wd] = { from: entry.from, to: entry.to };
      }
    }
    this.form = {
      id: row.id,
      name: row.name,
      branchGroupId: row.branch_group_id,
      addressLine1: row.address_line1 ?? '',
      postalCode: row.postal_code ?? '',
      city: row.city ?? '',
      openingHours: filled,
    };
    this.dialogVisible.set(true);
  }

  // -- opening hours helpers (template-friendly) --

  protected readonly weekdays = WEEKDAYS;

  /** Toggles "gesloten" for a weekday. Switching off opens with a sensible
   *  default (09:00–17:00); switching on clears the day. */
  protected toggleClosed(day: WeekDay, closed: boolean): void {
    this.form.openingHours[day] = closed ? null : { from: '09:00', to: '17:00' };
  }

  protected isClosed(day: WeekDay): boolean {
    return !this.form.openingHours[day];
  }

  protected setDayFrom(day: WeekDay, value: string): void {
    const cur = this.form.openingHours[day];
    if (!cur) return;
    this.form.openingHours[day] = { ...cur, from: value };
  }

  protected setDayTo(day: WeekDay, value: string): void {
    const cur = this.form.openingHours[day];
    if (!cur) return;
    this.form.openingHours[day] = { ...cur, to: value };
  }

  protected dayValue(day: WeekDay): OpeningHoursDay | null {
    return this.form.openingHours[day];
  }

  /** Compact 7-pill summary used on the service-locations table. Falls
   *  back to a dash when nothing is set (matches the address column). */
  protected openingSummary(oh: OpeningHours | undefined): Array<{
    short: string;
    long: string;
    open: boolean;
    from: string;
    to: string;
  }> {
    return WEEKDAYS.map(d => {
      const entry = oh?.[d.id];
      return {
        short: d.short,
        long: d.long,
        open: !!entry,
        from: entry?.from ?? '',
        to: entry?.to ?? '',
      };
    });
  }

  protected hasAnyOpeningHours(oh: OpeningHours | undefined): boolean {
    if (!oh) return false;
    return WEEKDAYS.some(d => !!oh[d.id]);
  }

  protected closeDialog(): void {
    if (this.saving()) return;
    this.dialogVisible.set(false);
  }

  protected canSave(): boolean {
    return !!this.form.name.trim() && !!this.form.branchGroupId;
  }

  protected save(): void {
    if (!this.canSave()) return;
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;

    this.saving.set(true);
    // Collapse the working copy back to a `Partial<Record<WeekDay,…>>`
    // shape — drop null entries so the wire format matches the server's
    // OpeningHours (null = "gesloten" is encoded by absence). Keeps the
    // payload compact for the typical "Mon-Fri 09-17" case.
    const openingHours: OpeningHours = {};
    for (const wd of [1, 2, 3, 4, 5, 6, 7] as const) {
      const v = this.form.openingHours[wd];
      if (v) openingHours[wd] = v;
    }

    const payload: CreateServiceLocationPayload = {
      companyId: company.id,
      branchGroupId: this.form.branchGroupId,
      name: this.form.name.trim(),
      addressLine1: this.form.addressLine1.trim() || undefined,
      postalCode: this.form.postalCode.trim() || undefined,
      city: this.form.city.trim() || undefined,
      openingHours,
    };

    const obs = this.form.id
      ? this.serviceLocationsApi.update(this.form.id, payload)
      : this.serviceLocationsApi.create(payload);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.refreshAll(company.id);
      },
      error: () => this.saving.set(false),
    });
  }

  protected remove(row: ServiceLocationModel): void {
    if (
      !confirm(
        `Verwijder service location "${row.name}"? Deze actie kan niet ongedaan gemaakt worden.`,
      )
    ) {
      return;
    }
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    this.serviceLocationsApi.remove(row.id).subscribe(() => {
      if (company) this.refreshAll(company.id);
    });
  }

  private refreshAll(companyId: string): void {
    this.loading.set(true);
    this.engagementGroupsApi.listForCompany(companyId).subscribe({
      next: branches => {
        this.branches.set(branches ?? []);
        this.cdr.markForCheck();
      },
      error: () => this.branches.set([]),
    });
    this.serviceLocationsApi.list(companyId).subscribe({
      next: rows => {
        this.serviceLocations.set(rows ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.serviceLocations.set([]);
        this.loading.set(false);
      },
    });
  }

  protected seedDemo(): void {
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    if (!company) return;
    this.http
      .post<{ skipped?: boolean }>(
        `${environment.apiBaseUrl}/poc-seed-demo?companyId=${encodeURIComponent(company.id)}`,
        {},
      )
      .subscribe({
        next: () => this.refreshAll(company.id),
      });
  }
}
