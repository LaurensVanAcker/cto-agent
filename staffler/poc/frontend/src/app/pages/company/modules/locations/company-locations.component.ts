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

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';

import { RootState } from '@dps/core/store';
import {
  CreateServiceGroupPayload,
  ServiceGroupApiService,
  ServiceGroupModel,
} from '@dps/core/api/service-group/service-group.api.service';
import {
  EngagementGroupApiService,
  EngagementGroupModel,
} from '@dps/core/api/engagement-group/engagement-group.api.service';

interface ServiceGroupForm {
  id: string | null;
  name: string;
  branchGroupId: string;
  addressLine1: string;
  postalCode: string;
  city: string;
}

function emptyForm(): ServiceGroupForm {
  return {
    id: null,
    name: '',
    branchGroupId: '',
    addressLine1: '',
    postalCode: '',
    city: '',
  };
}

/**
 * Beheer locaties — admin view for the PoC-DB service_groups table.
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
  private readonly serviceGroupsApi = inject(ServiceGroupApiService);
  private readonly engagementGroupsApi = inject(EngagementGroupApiService);
  private readonly store = inject(Store);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly branches = signal<EngagementGroupModel[]>([]);
  protected readonly serviceGroups = signal<ServiceGroupModel[]>([]);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly saving = signal(false);
  protected form: ServiceGroupForm = emptyForm();

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

  protected openEdit(row: ServiceGroupModel): void {
    this.form = {
      id: row.id,
      name: row.name,
      branchGroupId: row.branch_group_id,
      addressLine1: row.address_line1 ?? '',
      postalCode: row.postal_code ?? '',
      city: row.city ?? '',
    };
    this.dialogVisible.set(true);
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
    const payload: CreateServiceGroupPayload = {
      companyId: company.id,
      branchGroupId: this.form.branchGroupId,
      name: this.form.name.trim(),
      addressLine1: this.form.addressLine1.trim() || undefined,
      postalCode: this.form.postalCode.trim() || undefined,
      city: this.form.city.trim() || undefined,
    };

    const obs = this.form.id
      ? this.serviceGroupsApi.update(this.form.id, payload)
      : this.serviceGroupsApi.create(payload);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.dialogVisible.set(false);
        this.refreshAll(company.id);
      },
      error: () => this.saving.set(false),
    });
  }

  protected remove(row: ServiceGroupModel): void {
    if (
      !confirm(
        `Verwijder service location "${row.name}"? Deze actie kan niet ongedaan gemaakt worden.`,
      )
    ) {
      return;
    }
    const company = this.store.selectSnapshot(RootState.getCompanyData);
    this.serviceGroupsApi.remove(row.id).subscribe(() => {
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
    this.serviceGroupsApi.list(companyId).subscribe({
      next: rows => {
        this.serviceGroups.set(rows ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.serviceGroups.set([]);
        this.loading.set(false);
      },
    });
  }
}
