import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { DialogShiftBatchComponent } from '@dps/shared/components/dialog-shift-batch/dialog-shift-batch.component';
import { DialogShiftShareComponent } from '@dps/shared/components/dialog-shift-share/dialog-shift-share.component';
import { DialogAddServiceLocationComponent } from '@dps/shared/components/dialog-add-service-location/dialog-add-service-location.component';
import { DialogEditVestigingComponent } from '@dps/shared/components/dialog-edit-vestiging/dialog-edit-vestiging.component';
import { DialogVastBlockComponent } from '@dps/shared/components/dialog-vast-block/dialog-vast-block.component';
import { DialogAttachVestigingComponent } from '@dps/shared/components/dialog-attach-vestiging/dialog-attach-vestiging.component';
import { ContractDialogComponent } from '@dps/shared/components/contract-dialog/contract-dialog.component';
import type { ContractDialogDataModel } from '@dps/shared/components/contract-dialog/contract-dialog-data.model';
import { ContractConfirmationDialogComponent } from '../company/modules/actuals/components/contract-confirmation-dialog/contract-confirmation-dialog.component';
import {
  ContractConfirmation,
  ContractConfirmationStatus,
  EmployeeModel,
} from '@dps/shared/models';

/**
 * Auth-free dialog preview gallery.
 *
 * Each card opens one of the planning-poc dialogs against stub data so
 * the pilot operator (and reviewers) can visually verify the chrome
 * without a live DPS session. Backend calls inside the dialogs will 401
 * — the auth interceptor skips its redirect when the URL starts with
 * `/demo`, so the dialog stays mounted with empty data instead of
 * bouncing to /login.
 *
 * Use this when comparing implementation against the mockup HTMLs.
 */
@Component({
  selector: 'dps-demo-dialogs',
  standalone: true,
  imports: [CommonModule, ButtonModule, ToastModule],
  providers: [DialogService, MessageService],
  template: `
    <div class="demo-dialogs-host">
      <header class="demo-header">
        <h1>Dialog gallery</h1>
        <p>
          Visuele preview van alle planning-poc popups — gebruik dit om de
          chrome te vergelijken met de mockups. Backend-calls binnen de
          dialogs zullen 401 (geen sessie); de dialog-chrome rendert toch.
        </p>
      </header>

      <div class="demo-grid">
        <article class="demo-card">
          <h3>m09 — Nieuwe shift (Locaties)</h3>
          <p>Slot-based dialog voor het aanmaken van shifts in de Locaties-flow (multi-slot).</p>
          <button type="button" class="demo-btn" (click)="openShiftBatch()">
            Open m09 multi
          </button>
          <button type="button" class="demo-btn demo-btn-secondary" (click)="openShiftBatchSingle()">
            Open m09 single (Namen)
          </button>
        </article>

        <article class="demo-card">
          <h3>m12 — Open shifts delen</h3>
          <p>Batch-deel-dialog: volledige pool / specifieke namen / partners.</p>
          <button type="button" class="demo-btn" (click)="openShiftShare()">
            Open m12
          </button>
        </article>

        <article class="demo-card">
          <h3>m14 — Service location</h3>
          <p>Aanmaak-dialog voor SL onder een vestiging (alleen naam).</p>
          <button type="button" class="demo-btn" (click)="openAddSl()">
            Open m14 (aanmaken)
          </button>
          <button type="button" class="demo-btn demo-btn-secondary" (click)="openEditSl()">
            Open m14 (bewerken)
          </button>
        </article>

        <article class="demo-card">
          <h3>Vestiging — eigenschappen</h3>
          <p>Naam + werkadres + danger-zone delete-knop.</p>
          <button type="button" class="demo-btn" (click)="openEditVestiging()">
            Open vestiging-edit
          </button>
        </article>

        <article class="demo-card">
          <h3>Vast blok</h3>
          <p>Permanente medewerker block-toewijzing (datum + uren).</p>
          <button type="button" class="demo-btn" (click)="openVastBlock()">
            Open vast-blok
          </button>
        </article>

        <article class="demo-card">
          <h3>Orphan-SL koppelen</h3>
          <p>SL zonder vestiging — selectiedialog om hem te koppelen.</p>
          <button type="button" class="demo-btn" (click)="openAttachVestiging()">
            Open koppel-dialog
          </button>
        </article>

        <article class="demo-card">
          <h3>Prestatie bevestigen</h3>
          <p>Per-dag bevestiging van gewerkte uren (vervangt de iframe).</p>
          <button type="button" class="demo-btn" (click)="openConfirmActual()">
            Open prestatie-dialog
          </button>
        </article>

        <article class="demo-card">
          <h3>Contract-dialog (Namen)</h3>
          <p>
            Klik-op-cel / klik-op-bestaand contract in de Namen-view. Service
            location + Datum naast elkaar, werkuren + pauzes pre-filled in
            edit mode, Save-knop altijd zichtbaar.
          </p>
          <button type="button" class="demo-btn" (click)="openContractCreate()">
            Open create (klik op cel)
          </button>
          <button type="button" class="demo-btn demo-btn-secondary" (click)="openContractEdit()">
            Open edit (klik op contract)
          </button>
        </article>
      </div>

      <p-toast position="bottom-right" />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 32px;
        min-height: 100vh;
        background: #f8fafc;
      }
      .demo-header h1 {
        margin: 0 0 6px;
        font-size: 24px;
        font-weight: 700;
        color: #0f172a;
      }
      .demo-header p {
        margin: 0 0 24px;
        font-size: 13px;
        color: #64748b;
        max-width: 720px;
      }
      .demo-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 16px;
      }
      .demo-card {
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .demo-card h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0f172a;
      }
      .demo-card p {
        margin: 0;
        font-size: 12px;
        color: #64748b;
        flex: 1;
      }
      .demo-btn {
        margin-top: 6px;
        padding: 8px 14px;
        background: #fc074f;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
        cursor: pointer;
        transition: background-color 100ms ease;
      }
      .demo-btn:hover {
        background: #d70643;
      }
      .demo-btn-secondary {
        background: white;
        color: #fc074f;
        border: 1px solid #fc074f;
      }
      .demo-btn-secondary:hover {
        background: #fff1f2;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoDialogsComponent {
  private readonly dialogService = inject(DialogService);

  /** Track refs so we can react to onClose if needed. */
  private currentRef: DynamicDialogRef | null = null;

  /**
   * Mockup-09 column 2 demo pool — the gallery route runs without a DPS
   * session so the real /api/employees call 401s. We seed a deterministic
   * cross-section of names (full-availability, partial, permanent) so the
   * Persoon-kiezen dropdown shows all three group headers + the avatar +
   * availability range rendering exactly like the mockup.
   */
  private readonly demoPool = [
    { id: 'demo-emp-bart',     firstName: 'Bart',    lastName: 'Verhaegen' },
    { id: 'demo-emp-joke',     firstName: 'Joke',    lastName: 'Carton' },
    { id: 'demo-emp-muriel',   firstName: 'Muriel',  lastName: 'De Boel' },
    { id: 'demo-emp-jeff',     firstName: 'Jeff',    lastName: 'Callebaut' },
    { id: 'demo-emp-laurens',  firstName: 'Laurens', lastName: 'Van Acker' },
    { id: 'demo-emp-leslie',   firstName: 'Leslie',  lastName: 'Nikolov' },
    { id: 'demo-emp-lieven',   firstName: 'Lieven',  lastName: 'Bonamie' },
    { id: 'demo-emp-philippe', firstName: 'Philippe', lastName: 'Norman' },
    { id: 'demo-emp-sarah',    firstName: 'Sarah',   lastName: 'Dubois' },
    { id: 'demo-emp-thomas',   firstName: 'Thomas',  lastName: 'Janssens' },
  ];

  protected openShiftBatch(): void {
    this.currentRef = this.dialogService.open(DialogShiftBatchComponent, {
      showHeader: false,
      width: '38rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      data: {
        companyId: 'demo-company',
        date: new Date().toISOString().slice(0, 10),
        mode: 'multi',
        mockEmployees: this.demoPool,
      },
    });
  }

  /** Namen-view variant — single-slot mode hides the count badge, the
   *  per-slot X, and the "+ Shift toevoegen" button. The dialog still
   *  carries the same werkuren / pauze / loonpakket surface so the
   *  shape stays consistent. */
  protected openShiftBatchSingle(): void {
    this.currentRef = this.dialogService.open(DialogShiftBatchComponent, {
      showHeader: false,
      width: '38rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      data: {
        companyId: 'demo-company',
        date: new Date().toISOString().slice(0, 10),
        mode: 'single',
        mockEmployees: this.demoPool,
        // Pre-assign the first pool member so the dialog opens with an
        // assigned slot — that surface includes the loonpakket select +
        // the inline mismatch banner (mockup 09 column 3), so the
        // gallery variant doubles as a demo of screen 3.
        targetEmployeeIds: [this.demoPool[0].id],
      },
    });
  }

  protected openShiftShare(): void {
    this.currentRef = this.dialogService.open(DialogShiftShareComponent, {
      // Dialog renders its own header; suppress PrimeNG's default chrome.
      showHeader: false,
      modal: true,
      width: '34rem',
      data: {
        companyId: 'demo-company',
        weekIso: new Date().toISOString().slice(0, 10),
        shifts: [
          { id: 'demo-1', open_seats: 1 },
          { id: 'demo-2', open_seats: 1 },
          { id: 'demo-3', open_seats: 1 },
        ] as unknown as never,
      },
    });
  }

  protected openAddSl(): void {
    this.currentRef = this.dialogService.open(DialogAddServiceLocationComponent, {
      header: 'Nieuwe service location',
      modal: true,
      width: '30rem',
      data: {
        companyId: 'demo-company',
        branchGroupId: 'demo-branch',
        branchName: 'Gent Dok Noord',
      },
    });
  }

  protected openEditSl(): void {
    this.currentRef = this.dialogService.open(DialogAddServiceLocationComponent, {
      header: 'Service location bewerken',
      modal: true,
      width: '30rem',
      data: {
        companyId: 'demo-company',
        branchGroupId: 'demo-branch',
        branchName: 'Gent Dok Noord',
        existing: {
          id: 'demo-sl',
          name: 'Toog',
          company_id: 'demo-company',
          branch_group_id: 'demo-branch',
        } as unknown as never,
      },
    });
  }

  protected openEditVestiging(): void {
    this.currentRef = this.dialogService.open(DialogEditVestigingComponent, {
      header: 'Vestiging bewerken',
      modal: true,
      width: '32rem',
      data: {
        companyId: 'demo-company',
        branch: {
          id: 'demo-branch',
          name: 'Gent Dok Noord',
          companyId: 'demo-company',
        } as unknown as never,
      },
    });
  }

  protected openVastBlock(): void {
    this.currentRef = this.dialogService.open(DialogVastBlockComponent, {
      showHeader: false,
      width: '32rem',
      styleClass: 'm09-host',
      modal: true,
      focusOnShow: false,
      data: {
        permanentEmployeeId: 'demo-perm',
        employeeName: 'Sarah Dubois',
        dateFrom: new Date().toISOString().slice(0, 10),
        dateTo: new Date().toISOString().slice(0, 10),
        fromTime: '09:00',
        toTime: '17:00',
      },
    });
  }

  protected openAttachVestiging(): void {
    this.currentRef = this.dialogService.open(DialogAttachVestigingComponent, {
      header: 'Service location koppelen',
      modal: true,
      width: '30rem',
      data: {
        sl: {
          id: 'demo-orphan-sl',
          name: 'Bediening',
          company_id: 'demo-company',
          branch_group_id: null,
        } as unknown as never,
        companyId: 'demo-company',
      },
    });
  }

  protected openConfirmActual(): void {
    // Stub a 3-day pending confirmation so the dialog renders a realistic
    // editor without needing the DPS endpoint to respond.
    const today = new Date();
    const iso = (offset: number): string => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const mock: ContractConfirmation = {
      id: 'demo-conf',
      employeeId: 'demo-emp',
      companyId: 'demo-company',
      position: 'Barista',
      dateFrom: iso(-2),
      dateTo: iso(0),
      contractEndDate: iso(0),
      statuteCode: 'STU' as never,
      compensationHours: 'NO_COMPENSATION' as never,
      workTime: [-2, -1, 0].map(off => ({
        id: `demo-day-${off}`,
        date: iso(off),
        fromTime: '09:00',
        toTime: '17:00',
        pauseFromTime: '12:00',
        pauseToTime: '12:30',
        status: ContractConfirmationStatus.PENDING,
        absence: {
          type: null,
          reason: null,
          partialAbsenceDetails: { fromTime: null, toTime: null },
        },
        prefilledFromTimeRegistration: false,
      })),
    };
    const employee = {
      id: 'demo-emp',
      firstName: 'Demo',
      lastName: 'Werknemer',
    } as unknown as EmployeeModel;
    this.currentRef = this.dialogService.open(ContractConfirmationDialogComponent, {
      header: 'Prestatie bevestigen',
      modal: true,
      width: '52rem',
      data: { contractConfirmation: mock, employee },
    });
  }

  /**
   * Contract-dialog (create flow) — simulates a cell-click in the Namen
   * view. The dialog expects a Bryntum EventModel-like object with
   * `getData` for the keys it reads (id/startDate/endDate/timetable).
   * We hand-roll a tiny stub so we don't have to bootstrap a full
   * scheduler instance just to render the dialog.
   *
   * Bryntum events are considered "placeholder" (= create mode) when
   * `hasGeneratedId` is truthy, so we set that to true.
   */
  protected openContractCreate(): void {
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const evt = this.makeStubEventRecord({
      id: 'demo-new',
      startDate: today,
      endDate: today,
      hasGeneratedId: true,
      timetable: null,
    });
    const employee = {
      id: 'demo-emp',
      firstName: 'Anouk',
      lastName: 'Staelens',
      name: 'Anouk Staelens',
    } as unknown as EmployeeModel;
    this.currentRef = this.dialogService.open(ContractDialogComponent, {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      width: '38rem',
      data: {
        contractEventRecord: evt as never,
        employee,
        initialDate: today.toISOString().slice(0, 10),
      } satisfies ContractDialogDataModel,
    });
  }

  /**
   * Contract-dialog (edit flow) — simulates clicking an existing
   * contract block. The placeholder timetable is pre-populated with
   * werkuren + pauzes so the form pre-fills correctly even if the
   * /api/contracts/:id GET takes a moment (or 401s in this auth-less
   * demo route).
   */
  protected openContractEdit(): void {
    const today = new Date();
    const iso = (offset: number): string => {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const dateFrom = new Date(today);
    dateFrom.setHours(9, 0, 0, 0);
    const dateTo = new Date(today);
    dateTo.setHours(17, 0, 0, 0);
    const evt = this.makeStubEventRecord({
      id: 'demo-existing',
      startDate: dateFrom,
      endDate: dateTo,
      hasGeneratedId: false,
      timetable: {
        schedule: [
          {
            date: iso(0),
            fromTime: '09:00',
            toTime: '17:00',
            pauseFromTime: '12:00',
            pauseToTime: '12:30',
            shiftTemplateName: null,
            createShiftTemplate: false,
          },
        ],
      },
    });
    const employee = {
      id: 'demo-emp',
      firstName: 'Anouk',
      lastName: 'Staelens',
      name: 'Anouk Staelens',
    } as unknown as EmployeeModel;
    this.currentRef = this.dialogService.open(ContractDialogComponent, {
      modal: true,
      showHeader: false,
      focusOnShow: false,
      width: '38rem',
      data: {
        contractEventRecord: evt as never,
        employee,
      } satisfies ContractDialogDataModel,
    });
  }

  /**
   * Tiny stub of Bryntum's EventModel — just enough surface for the
   * contract-dialog (getData / set / remove / hasGeneratedId). Keeps the
   * gallery decoupled from Bryntum's scheduler bootstrap; the dialog
   * never touches the scheduler instance, only the record's data.
   */
  private makeStubEventRecord(
    seed: Record<string, unknown> & { hasGeneratedId: boolean },
  ): { getData: (key: string) => unknown; set: (val: unknown) => void; remove: () => void; hasGeneratedId: boolean } {
    const data: Record<string, unknown> = { ...seed };
    return {
      hasGeneratedId: !!seed.hasGeneratedId,
      getData: (key: string) => data[key],
      set: (val: unknown) => {
        if (val && typeof val === 'object') {
          Object.assign(data, val as Record<string, unknown>);
        }
      },
      remove: () => {
        /* no-op in gallery */
      },
    };
  }
}
