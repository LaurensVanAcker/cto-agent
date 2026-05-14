import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { StafflerService } from '../../core/api/staffler.service';
import type { ContractBase, PageWebDto } from '../../core/api/models';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './contracts.component.html',
})
export class ContractsComponent {
  private staffler = inject(StafflerService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected page = signal<PageWebDto<ContractBase> | null>(null);
  protected companyId = signal<string | null>(null);
  protected weekStart = signal<string>(this.mondayOfThisWeek());

  constructor() {
    const qpCompany = this.route.snapshot.queryParamMap.get('companyId');
    const activeCompany = this.auth.activeCompanyId();
    const id = qpCompany || activeCompany;
    if (id) {
      this.companyId.set(id);
      void this.load();
    } else {
      this.error.set('Geen companyId beschikbaar. Activeer eerst een membership op het dashboard.');
    }
  }

  setWeekStart(value: string): void {
    this.weekStart.set(value);
    void this.load();
  }

  async load(): Promise<void> {
    const id = this.companyId();
    if (!id) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const start = this.weekStart();
      const end = addDaysIso(start, 6);
      const result = await this.staffler.listContracts({
        companyId: id,
        startDate: start,
        endDate: end,
      });
      this.page.set(result);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      this.error.set(`Fout bij laden van contracten (HTTP ${status ?? '?'}).`);
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  private mondayOfThisWeek(): string {
    const d = new Date();
    const dow = d.getDay();
    d.setDate(d.getDate() - ((dow + 6) % 7));
    return toLocalIsoDate(d);
  }
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toLocalIsoDate(dt);
}
