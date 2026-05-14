import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTime } from 'luxon';

import type { SchedulerConfig } from '@bryntum/scheduler';
import { BryntumSchedulerModule } from '@bryntum/scheduler-angular';

import { ButtonModule } from 'primeng/button';
import { DialogService } from 'primeng/dynamicdialog';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { GENERAL_SCHEDULER_CONFIG } from '@dps/shared/configs';

type View = 'names' | 'locations' | 'day';
type ZoomLevel = 'day' | 'week' | '2weeks';

interface Resource {
  id: string;
  name: string;
  parentId?: string;
  expanded?: boolean;
  group?: string;
}

interface Event {
  id: string;
  resourceId: string;
  startDate: Date;
  endDate: Date;
  name: string;
  cls: string;
  eventColor: string;
  kind: 'contract' | 'shift' | 'permanent' | 'availability';
}

// Bryntum's `b-sch-color-*` classes set `--event-color: #fff` for white-text
// styling, which inverts the v5 palette (we want dark text on a pale block).
// Drop those entirely; the `.poc-event-*` classes alone drive the block
// styling via global rules in styles.scss.
function clsFor(kind: Event['kind'], extra = ''): string {
  return `poc-event poc-event-${kind} ${extra}`.trim();
}

/**
 * Demo-mode planning view. Renders the Bryntum scheduler with fixed mock
 * data — no API calls, no auth guard. Use this to visually confirm the
 * planning grid before pointing it at the live DPS data.
 *
 * Open at /demo/planning. Mirrors mockup 10 (Namen) / 11 (Locaties) / 13 (Dag).
 */
@Component({
  selector: 'dps-demo-planning',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BryntumSchedulerModule,
    ButtonModule,
    SelectButtonModule,
    TooltipModule,
    ToastModule,
  ],
  providers: [DialogService, MessageService],
  templateUrl: './demo-planning.component.html',
  styleUrl: './demo-planning.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-auto flex-column overflow-hidden p-3 gap-3' },
})
export class DemoPlanningComponent {
  protected readonly view = signal<View>('names');
  protected readonly zoom = signal<ZoomLevel>('week');
  protected readonly viewOptions = [
    { label: 'Medewerkers', value: 'names' },
    { label: 'Locaties', value: 'locations' },
  ];
  protected readonly zoomOptions = [
    { label: 'Dag', value: 'day' },
    { label: 'Week', value: 'week' },
    { label: '2 weken', value: '2weeks' },
  ];

  /** Anchor monday of the visible week. */
  protected readonly weekStart = signal<string>(
    DateTime.now().startOf('week').toISODate() ?? '',
  );

  protected readonly weekLabel = computed(() => {
    const start = DateTime.fromISO(this.weekStart()).setLocale('nl-BE');
    const end = start.plus({ days: this.zoom() === '2weeks' ? 13 : 6 });
    return `${start.toFormat('d MMM yyyy')} – ${end.toFormat('d MMM yyyy')} (Week ${start.weekNumber})`;
  });

  protected readonly startDate = computed(() => {
    const week = DateTime.fromISO(this.weekStart());
    if (this.zoom() === 'day') {
      return DateTime.now().startOf('day').toJSDate();
    }
    return week.toJSDate();
  });

  protected readonly endDate = computed(() => {
    const week = DateTime.fromISO(this.weekStart());
    switch (this.zoom()) {
      case 'day': {
        const day = DateTime.now().startOf('day');
        return day.plus({ days: 1 }).toJSDate();
      }
      case '2weeks':
        return week.plus({ days: 14 }).toJSDate();
      case 'week':
      default:
        return week.plus({ days: 7 }).toJSDate();
    }
  });

  /**
   * Event-bar renderer mirroring planning-poc — paints the v5 block markup
   * so the demo route accurately previews the real planning layout
   * (no API calls needed).
   */
  private readonly eventBarRenderer = ({
    eventRecord,
  }: {
    eventRecord: { getData: (key: string) => unknown };
  }): string => {
    const kind = eventRecord.getData('kind') as Event['kind'] | undefined;
    const name = String(eventRecord.getData('name') ?? '');
    const start = eventRecord.getData('startDate') as Date | undefined;
    const end = eventRecord.getData('endDate') as Date | undefined;
    const fmt = (d: Date | undefined): string =>
      d ? DateTime.fromJSDate(d).toFormat('HH:mm') : '';

    if (kind === 'permanent') {
      return `
        <div class="poc-event-title">
          <span class="poc-vast-tag">Vast</span>
          <span>${name.replace(/^Vast\s*[-—]?\s*/, '')}</span>
        </div>
        <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
    }
    if (kind === 'shift') {
      // New semantics (2026-05-12 pilot feedback): title shows the count
      // of OPEN seats ("2 open shifts"), badge shows POSITIVE REACTIONS
      // from the pool ("+5"). We parse both out of the mock name.
      const seatsMatch = name.match(/seats=(\d+)/);
      const appsMatch = name.match(/apps=(\d+)/);
      const seats = seatsMatch ? Number(seatsMatch[1]) : 1;
      const apps = appsMatch ? Number(appsMatch[1]) : 0;
      const title = `${seats} open shift${seats === 1 ? '' : 's'}`;
      const badge =
        apps > 0
          ? `<span class="poc-open-badge" aria-label="${apps} reacties">${apps}</span>`
          : '';
      return `
        ${badge}
        <div class="poc-event-title">${title}</div>
        <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
    }
    return `
      <div class="poc-event-title">${name}</div>
      <div class="poc-event-times">${fmt(start)} – ${fmt(end)}</div>`;
  };

  /** Bryntum scheduler config — flips to vertical for the Dag zoom. */
  protected readonly schedulerConfig = computed<Partial<SchedulerConfig>>(() => {
    if (this.zoom() === 'day') {
      return {
        ...GENERAL_SCHEDULER_CONFIG,
        viewPreset: {
          base: 'hourAndDay',
          tickWidth: 60,
          headers: [
            {
              unit: 'day',
              dateFormat: 'dddd D MMMM',
              headerCellCls: 'justify-content-center text-base font-medium',
            },
            { unit: 'hour', dateFormat: 'HH:mm' },
          ],
        },
        mode: 'vertical',
        eventStyle: 'plain',
        eventRenderer: this.eventBarRenderer,
        rowHeight: 60,
        barMargin: 4,
        allowOverlap: true,
      } as unknown as Partial<SchedulerConfig>;
    }
    return {
      ...GENERAL_SCHEDULER_CONFIG,
      eventStyle: 'plain',
      eventRenderer: this.eventBarRenderer,
      rowHeight: 65,
      // Lane-stack assigned + open shifts on the same row (Locaties view).
      allowOverlap: true,
    } as unknown as Partial<SchedulerConfig>;
  });

  /** Mock employees (Names view) — matches the names in mockup 10. */
  private readonly employees = [
    { id: 'emp-1', name: 'Anouk Staelens' },
    { id: 'emp-2', name: 'Bart Verhaegen' },
    { id: 'emp-3', name: 'Jeff Callebaut' },
    { id: 'emp-4', name: 'Joke Carton' },
    { id: 'emp-5', name: 'Laurens Van Acker' },
    { id: 'perm-1', name: 'Sarah Dubois (vast)' },
    { id: 'perm-2', name: 'Thomas Janssens (vast)' },
  ];

  private readonly branches = [
    { id: 'br-gent', name: 'Gent Dok Noord' },
    { id: 'br-antw', name: 'Antwerpen Eilandje' },
  ];

  private readonly serviceGroups = [
    { id: 'sg-gent-toog', name: 'Toog', branchId: 'br-gent' },
    { id: 'sg-gent-kassa', name: 'Kassa', branchId: 'br-gent' },
    { id: 'sg-gent-terras', name: 'Terras', branchId: 'br-gent' },
    { id: 'sg-antw-bar', name: 'Bar', branchId: 'br-antw' },
  ];

  /** Resources for Bryntum. Flat in Names view, "Vestiging > Service" in Locaties/Dag. */
  protected readonly resources = computed<Resource[]>(() => {
    if (this.view() === 'names') {
      return this.employees;
    }
    // Locaties / Dag view: prepend the branch name so the row label encodes
    // the vestiging > service-location hierarchy without needing Bryntum's
    // resource-store tree mode.
    //
    // We deliberately omit the `group` field — Bryntum would otherwise
    // try to render a grouping header per branch and squash the
    // service-group rows behind it, so reviewers couldn't see all four
    // SLs at once in the demo.
    return this.serviceGroups.map(sg => {
      const branch = this.branches.find(b => b.id === sg.branchId)?.name ?? '';
      return {
        id: sg.id,
        name: `${branch} › ${sg.name}`,
      };
    });
  });

  /** Mock events. Three kinds per the planning plan. */
  protected readonly events = computed<Event[]>(() => {
    const week = DateTime.fromISO(this.weekStart());
    const day = (offset: number) => week.plus({ days: offset });

    const events: Event[] = [];

    if (this.view() === 'names') {
      // Contracts (DPS) — pink blocks per mockup 10.
      events.push({
        id: 'c-1',
        resourceId: 'emp-1',
        startDate: day(1).set({ hour: 9 }).toJSDate(),  // Tue 09:00
        endDate: day(2).set({ hour: 17 }).toJSDate(),   // Wed 17:00 (multi-day)
        name: 'Anouk',
        cls: clsFor('contract'),
        eventColor: undefined as unknown as string,
        kind: 'contract',
      });
      events.push({
        id: 'c-2',
        resourceId: 'emp-2',
        startDate: day(3).set({ hour: 10 }).toJSDate(),
        endDate: day(3).set({ hour: 18 }).toJSDate(),
        name: 'Bart',
        cls: clsFor('contract'),
        eventColor: undefined as unknown as string,
        kind: 'contract',
      });
      events.push({
        id: 'c-3',
        resourceId: 'emp-3',
        startDate: day(1).set({ hour: 10 }).toJSDate(),
        endDate: day(1).set({ hour: 18 }).toJSDate(),
        name: 'Jeff',
        cls: clsFor('contract'),
        eventColor: undefined as unknown as string,
        kind: 'contract',
      });

      // Vast (permanent assignment) — teal blocks per mockup 10.
      for (let d = 1; d <= 4; d++) {
        events.push({
          id: `p-1-${d}`,
          resourceId: 'perm-1',
          startDate: day(d).set({ hour: 8 }).toJSDate(),
          endDate: day(d).set({ hour: d === 4 ? 13 : 17 }).toJSDate(),
          name: 'Sarah',
          cls: clsFor('permanent'),
          eventColor: undefined as unknown as string,
          kind: 'permanent',
        });
      }
      for (let d = 1; d <= 5; d++) {
        events.push({
          id: `p-2-${d}`,
          resourceId: 'perm-2',
          startDate: day(d).set({ hour: 9 }).toJSDate(),
          endDate: day(d).set({ hour: 18 }).toJSDate(),
          name: 'Thomas',
          cls: clsFor('permanent'),
          eventColor: undefined as unknown as string,
          kind: 'permanent',
        });
      }
      return events;
    }

    // Locaties / Dag view: shifts on service-group rows. Names encode
    // `seats=N apps=M` so the renderer can render the title ("N open
    // shifts") and badge (M applicants). Matches the new buildEvents
    // semantics in planning-poc.
    events.push({
      id: 's-1',
      resourceId: 'sg-gent-toog',
      startDate: day(2).set({ hour: 17 }).toJSDate(),
      endDate: day(2).set({ hour: 23 }).toJSDate(),
      name: 'seats=2 apps=5',
      cls: clsFor('shift'),
      eventColor: undefined as unknown as string,
      kind: 'shift',
    });
    events.push({
      id: 's-2',
      resourceId: 'sg-gent-kassa',
      startDate: day(3).set({ hour: 12 }).toJSDate(),
      endDate: day(3).set({ hour: 22 }).toJSDate(),
      name: 'seats=1 apps=0',
      cls: clsFor('shift', 'poc-event-shift-draft'),
      eventColor: undefined as unknown as string,
      kind: 'shift',
    });
    events.push({
      id: 's-3',
      resourceId: 'sg-gent-terras',
      startDate: day(5).set({ hour: 14 }).toJSDate(),
      endDate: day(5).set({ hour: 23 }).toJSDate(),
      name: 'seats=3 apps=2',
      cls: clsFor('shift'),
      eventColor: undefined as unknown as string,
      kind: 'shift',
    });

    // Mixed shift demo (1 assigned + 1 open) — illustrates the new
    // "split-block" rendering. The assigned slot lands as an indigo
    // contract-style block with the employee's name; the open slot is
    // a separate amber-dashed block on the same row stacking via
    // allowOverlap.
    events.push({
      id: 's-mix-assigned',
      resourceId: 'sg-antw-bar',
      startDate: day(4).set({ hour: 18 }).toJSDate(),
      endDate: day(4).set({ hour: 23 }).toJSDate(),
      name: 'Joke Carton',
      cls: 'poc-event poc-event-contract',
      eventColor: undefined as unknown as string,
      kind: 'contract',
    });
    events.push({
      id: 's-mix-open',
      resourceId: 'sg-antw-bar',
      startDate: day(4).set({ hour: 18 }).toJSDate(),
      endDate: day(4).set({ hour: 23 }).toJSDate(),
      name: 'seats=1 apps=3',
      cls: clsFor('shift'),
      eventColor: undefined as unknown as string,
      kind: 'shift',
    });
    // Vast on service-group rows (Sarah on Toog, Thomas on Kassa)
    for (let d = 1; d <= 4; d++) {
      events.push({
        id: `pl-sg-toog-${d}`,
        resourceId: 'sg-gent-toog',
        startDate: day(d).set({ hour: 8 }).toJSDate(),
        endDate: day(d).set({ hour: d === 4 ? 13 : 17 }).toJSDate(),
        name: 'Vast — Sarah',
        cls: clsFor('permanent'),
        eventColor: undefined as unknown as string,
        kind: 'permanent',
      });
    }
    return events;
  });

  protected previousWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).minus({
      weeks: this.zoom() === '2weeks' ? 2 : 1,
    });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
  }

  protected nextWeek(): void {
    const d = DateTime.fromISO(this.weekStart()).plus({
      weeks: this.zoom() === '2weeks' ? 2 : 1,
    });
    this.weekStart.set(d.toISODate() ?? this.weekStart());
  }

  protected today(): void {
    this.weekStart.set(DateTime.now().startOf('week').toISODate() ?? '');
  }
}
