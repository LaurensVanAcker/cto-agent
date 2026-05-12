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

// Bryntum's material theme exposes these color classes via b-sch-color-<name>.
// Picking the names that map closest to the mockup 10 palette.
const COLOR_BY_KIND: Record<Event['kind'], string> = {
  contract: 'indigo',
  shift: 'orange',
  permanent: 'teal',
  availability: 'green',
};

/** Bryntum picks the color class from the `cls` field reliably; setting
 *  `eventColor` on the data record alone wasn't being recognized in our
 *  build. We hard-append `b-sch-color-<name>` to the event cls so the
 *  theme's color rules take effect. */
function clsFor(kind: Event['kind'], extra = ''): string {
  return `poc-event poc-event-${kind} b-sch-color-${COLOR_BY_KIND[kind]} ${extra}`.trim();
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
    { label: 'Namen', value: 'names' },
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
        eventStyle: 'border',
        rowHeight: 60,
        barMargin: 4,
      } as unknown as Partial<SchedulerConfig>;
    }
    return {
      ...GENERAL_SCHEDULER_CONFIG,
      // Use Bryntum's built-in 'colored' eventStyle which fills the event
      // background with the per-event eventColor field. Combined with our
      // poc-event-* classes this gives us the mockup-10 indigo / teal / orange
      // palette without fighting Bryntum's encapsulation.
      eventStyle: 'border',
      rowHeight: 65,
    } as Partial<SchedulerConfig>;
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
    return this.serviceGroups.map(sg => {
      const branch = this.branches.find(b => b.id === sg.branchId)?.name ?? '';
      return {
        id: sg.id,
        name: `${branch} › ${sg.name}`,
        group: branch,
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
        eventColor: COLOR_BY_KIND.contract,
        kind: 'contract',
      });
      events.push({
        id: 'c-2',
        resourceId: 'emp-2',
        startDate: day(3).set({ hour: 10 }).toJSDate(),
        endDate: day(3).set({ hour: 18 }).toJSDate(),
        name: 'Bart',
        cls: clsFor('contract'),
        eventColor: COLOR_BY_KIND.contract,
        kind: 'contract',
      });
      events.push({
        id: 'c-3',
        resourceId: 'emp-3',
        startDate: day(1).set({ hour: 10 }).toJSDate(),
        endDate: day(1).set({ hour: 18 }).toJSDate(),
        name: 'Jeff',
        cls: clsFor('contract'),
        eventColor: COLOR_BY_KIND.contract,
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
          eventColor: COLOR_BY_KIND.permanent,
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
          eventColor: COLOR_BY_KIND.permanent,
          kind: 'permanent',
        });
      }
      return events;
    }

    // Locaties / Dag view: shifts on service-group rows.
    events.push({
      id: 's-1',
      resourceId: 'sg-gent-toog',
      startDate: day(2).set({ hour: 17 }).toJSDate(),
      endDate: day(2).set({ hour: 23 }).toJSDate(),
      name: 'Open shift × 2',
      cls: clsFor('shift'),
      eventColor: COLOR_BY_KIND.shift,
      kind: 'shift',
    });
    events.push({
      id: 's-2',
      resourceId: 'sg-gent-kassa',
      startDate: day(3).set({ hour: 12 }).toJSDate(),
      endDate: day(3).set({ hour: 22 }).toJSDate(),
      name: 'Open shift × 1',
      cls: clsFor('shift', 'poc-event-shift-draft'),
      eventColor: COLOR_BY_KIND.shift,
      kind: 'shift',
    });
    events.push({
      id: 's-3',
      resourceId: 'sg-gent-terras',
      startDate: day(5).set({ hour: 14 }).toJSDate(),
      endDate: day(5).set({ hour: 23 }).toJSDate(),
      name: 'Open shift × 3',
      cls: clsFor('shift'),
      eventColor: COLOR_BY_KIND.shift,
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
        eventColor: COLOR_BY_KIND.permanent,
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
