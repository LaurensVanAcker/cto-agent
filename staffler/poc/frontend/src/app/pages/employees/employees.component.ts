import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { StafflerService } from '../../core/api/staffler.service';
import type { Employee, PageWebDto } from '../../core/api/models';

@Component({
  selector: 'app-employees',
  standalone: true,
  templateUrl: './employees.component.html',
})
export class EmployeesComponent {
  private staffler = inject(StafflerService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected page = signal<PageWebDto<Employee> | null>(null);
  protected companyId = signal<string | null>(null);

  constructor() {
    const qpCompany = this.route.snapshot.queryParamMap.get('companyId');
    const activeCompany = this.auth.activeCompanyId();
    const id = qpCompany || activeCompany;
    if (id) {
      this.companyId.set(id);
      void this.load(id);
    } else {
      this.error.set('Geen companyId beschikbaar. Activeer eerst een membership op het dashboard.');
    }
  }

  private async load(companyId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.staffler.listEmployees({
        companyId,
        page: 0,
        size: 50,
      });
      this.page.set(result);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      this.error.set(`Fout bij laden van employees (HTTP ${status ?? '?'}).`);
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }
}
