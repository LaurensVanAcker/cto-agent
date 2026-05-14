import { SchedulerConfig } from '@bryntum/scheduler';
import { DateTime } from 'luxon';

export const TODAY_TIME_RANGE_ID = 1;

export const MOBILE_SCHEDULER_CONFIG = {
  viewPreset: {
    base: 'dayAndWeek',
    headers: [
      {
        unit: 'day',
        headerCellCls: 'justify-content-center text-base',
        dateFormat: 'dddd MMMM D',
      },
    ],
  },
  columns: [
    {
      text: 'EMPLOYEE',
      field: 'name',
      width: 130,
      cellCls: 'flex white-space-normal line-height-2 cursor-pointer font-normal',
    },
  ],
  timeRanges: [
    {
      id: TODAY_TIME_RANGE_ID,
      startDate: DateTime.now().startOf('day').toJSDate(),
      duration: 1,
      durationUnit: 'day',
      cls: 'today-range',
    },
  ],
  features: {
    nonWorkingTime: true,
    cellEdit: false,
    regionResize: false,
    eventResize: false,
    scheduleMenu: false,
    eventMenu: false,
    eventTooltip: false,
    scheduleTooltip: false,
    timeAxisHeaderMenu: false,
    eventDrag: false,
    eventEdit: {
      triggerEvent: 'eventclick',
    },
    timeRanges: true,
    eventDragCreate: false,
    cellTooltip: false,
  },
  weekStartDay: 1,
  eventStyle: 'hollow',
  rowHeight: 65,
  fillTicks: true,
  allowOverlap: false,
  zoomOnMouseWheel: false,
  zoomOnTimeAxisDoubleClick: false,
  createEventOnDblClick: false,
  hideRowHover: false,
} satisfies Partial<SchedulerConfig>;

export const GENERAL_SCHEDULER_CONFIG = {
  viewPreset: {
    base: 'dayAndWeek',
    headers: [
      {
        unit: 'week',
        renderer: (start: Date) => {
          const weekStart = DateTime.fromJSDate(start).startOf('week');
          const weekEnd = DateTime.fromJSDate(start).endOf('week');

          return `${weekStart.toLocaleString(DateTime.DATE_MED)} - ${weekEnd.toLocaleString(DateTime.DATE_MED)} (Week ${weekStart.weekNumber})`;
        },
      },
      {
        unit: 'day',
        dateFormat: 'ddd D',
      },
    ],
  },
  columns: [
    {
      text: 'EMPLOYEE',
      field: 'name',
      width: 150,
      enableHeaderContextMenu: false,
      enableCellContextMenu: false,
      cls: 'employee-column',
      cellCls: 'flex white-space-normal line-height-2 cursor-pointer font-normal',
      tooltipRenderer: ({ record, column }) =>
        column.L('NAVIGATE_TO_EMPLOYEE_PROFILE', record.getData('firstName')),
    },
  ],
  timeRanges: [
    {
      id: TODAY_TIME_RANGE_ID,
      startDate: DateTime.now().startOf('day').toJSDate(),
      duration: 1,
      durationUnit: 'day',
      cls: 'today-range',
    },
  ],
  features: {
    nonWorkingTime: true,
    cellEdit: false,
    regionResize: false,
    eventResize: false,
    scheduleMenu: false,
    eventMenu: false,
    eventTooltip: false,
    scheduleTooltip: false,
    timeAxisHeaderMenu: false,
    eventDrag: false,
    eventEdit: {
      triggerEvent: 'eventclick',
    },
    cellTooltip: {
      hoverDelay: 0,
      hideDelay: 0,
    },
    timeRanges: true,
  },
  weekStartDay: 1,
  eventStyle: 'hollow',
  rowHeight: 80,
  fillTicks: true,
  allowOverlap: false,
  zoomOnMouseWheel: false,
  zoomOnTimeAxisDoubleClick: false,
  createEventOnDblClick: false,
  hideRowHover: false,
} satisfies Partial<SchedulerConfig>;
