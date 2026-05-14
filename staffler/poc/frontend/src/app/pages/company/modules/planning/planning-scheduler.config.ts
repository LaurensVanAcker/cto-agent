import { DomClassList, SchedulerConfig } from '@bryntum/scheduler';

import { GENERAL_SCHEDULER_CONFIG, MOBILE_SCHEDULER_CONFIG } from '@dps/shared/configs';
import { ContractListModel } from '@dps/shared/models';
import { DateTime } from 'luxon';

export const PLANNING_SCHEDULER_CONFIG = {
  ...GENERAL_SCHEDULER_CONFIG,
  eventRenderer({ eventRecord }) {
    if (eventRecord.get('copyContractsButtonsEnabled')) {
      const disabled = eventRecord.get('isDisabled');
      const disabledClass = disabled ? 'copy-contracts-btn--disabled' : '';
      const tooltip = eventRecord.get('tooltipText') || '';

      return `<button 
        class="copy-contracts-btn ${disabledClass}" 
        data-btip="${tooltip}"
        data-resource-id="${eventRecord.resourceId}"
        ${disabled ? 'style="pointer-events: none;"' : ''}
      >
        <span class="dps-icon dps-icon-double_arrow_right"></span>
      </button>`;
    }

    if (eventRecord.hasGeneratedId) return `<span class="px-2 pt-1">${eventRecord.name}</span>`;

    const { position, timetable } = (eventRecord as any).data as ContractListModel;
    return `
      <div class="flex flex-column justify-content-around w-full">
        <span class="font-medium px-2">${position}</span>

        <div class="flex">
          ${timetable.schedule
            .map(daySchedule => {
              const dayScheduleWidthPercentage: string = `${100 / timetable.schedule.length}%`;

              return `
                <div class="flex justify-content-center align-items-center" style="width: ${dayScheduleWidthPercentage}">
                  <span>${daySchedule.fromTime}</span>
                  <span style="font-size: 20px" class="dps-icon dps-icon-chevron"></span>
                  <span>${daySchedule.toTime}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },
} satisfies Partial<SchedulerConfig>;

export const MOBILE_PLANNING_SCHEDULER_CONFIG = {
  ...MOBILE_SCHEDULER_CONFIG,
  eventRenderer({ eventRecord, scheduler }) {
    if (eventRecord.hasGeneratedId) return `<span class="px-2 pt-1">${eventRecord.name}</span>`;

    const { position, timetable } = (eventRecord as any).data as ContractListModel;
    let visibleDaySchedule = timetable.schedule[0];

    if (timetable.schedule.length > 1) {
      const visibleDayScheduleIndex = timetable.schedule.findIndex(
        daySchedule => daySchedule.date === DateTime.fromJSDate(scheduler.startDate).toISODate()
      );
      visibleDaySchedule = timetable.schedule[visibleDayScheduleIndex];
      const isFirstDaySchedule = visibleDayScheduleIndex === 0;
      const isLastDaySchedule = visibleDayScheduleIndex === timetable.schedule.length - 1;
      const classList = new DomClassList('');

      if (!isFirstDaySchedule) {
        classList.add('border-noround-left border-left-none');
      }
      if (!isLastDaySchedule) {
        classList.add('border-noround-right border-right-none');
      }

      eventRecord.setStartEndDate(scheduler.startDate, scheduler.endDate, true);
      eventRecord.cls = classList.toString();
    }

    return `
      <div class="flex flex-column justify-content-around w-full">
        <span class="font-medium px-2 text-center">${position}</span>

          <div class="flex justify-content-center align-items-center">
            <span>${visibleDaySchedule?.fromTime}</span>
            <span style="font-size: 20px" class="dps-icon dps-icon-chevron"></span>
            <span>${visibleDaySchedule?.toTime}</span>
        </div>
      </div>
    `;
  },
} satisfies Partial<SchedulerConfig>;
