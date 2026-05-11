import { DomClassList, SchedulerConfig } from '@bryntum/scheduler';
import { GENERAL_SCHEDULER_CONFIG, MOBILE_SCHEDULER_CONFIG } from '@dps/shared/configs';
import { ContractConfirmation } from '@dps/shared/models';
import { DateTime } from 'luxon';

export const MOBILE_ACTUALS_SCHEDULER_CONFIG = {
  ...MOBILE_SCHEDULER_CONFIG,
  eventRenderer({ eventRecord, renderData, scheduler }) {
    const { position, workTime, contractEndDate } = (eventRecord as any)
      .data as ContractConfirmation;
    const contractEndDatetime = DateTime.fromSQL(contractEndDate);
    let visibleDaySchedule = workTime[0];
    let confirmationHeaderStyles = new Map<string, string>([['background-color', 'currentColor']]);

    if (contractEndDatetime.isValid && contractEndDatetime < DateTime.now()) {
      const lastScheduleDay = workTime[workTime.length - 1];
      renderData.cls += lastScheduleDay.status;
    } else {
      renderData.cls += 'pointer-events-none';
    }

    if (workTime.length > 1) {
      const visibleDayScheduleIndex = workTime.findIndex(
        daySchedule => daySchedule.date === DateTime.fromJSDate(scheduler.startDate).toISODate()
      );
      visibleDaySchedule = workTime[visibleDayScheduleIndex];
      const isFirstDaySchedule = visibleDayScheduleIndex === 0;
      const isLastDaySchedule = visibleDayScheduleIndex === workTime.length - 1;
      const classList = new DomClassList('');

      if (!isFirstDaySchedule) {
        classList.add('border-noround-left border-left-none');
        confirmationHeaderStyles.set('border-bottom-left-radius', '0 !important');
      }
      if (!isLastDaySchedule) {
        classList.add('border-noround-right border-right-none');
        confirmationHeaderStyles.set('border-bottom-right-radius', '0 !important');
      }

      eventRecord.setStartEndDate(scheduler.startDate, scheduler.endDate, true);
      eventRecord.cls = classList.toString();
    }

    const confirmationHeaderStylesString = Array.from(confirmationHeaderStyles)
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    const dayIconTemplate: string = visibleDaySchedule.prefilledFromTimeRegistration
      ? "<span class='dps-icon dps-icon-timer text-lg ml-1'></span>"
      : '';

    return `
      <div class="flex justify-content-between flex-column w-full">
        <div class="py-1 text-center border-round-bottom-lg" style="${confirmationHeaderStylesString}">
          <span class="text-white">${position}</span>
        </div>

        <div class="flex justify-content-center align-items-center">
          <span>${visibleDaySchedule.fromTime}</span>
          <span style="font-size: 20px" class="dps-icon dps-icon-chevron"></span>
          <span>${visibleDaySchedule.toTime || '&nbsp'}</span>

          ${dayIconTemplate}
        </div>
      </div>
    `;
  },
} satisfies Partial<SchedulerConfig>;

export const ACTUALS_SCHEDULER_CONFIG = {
  ...GENERAL_SCHEDULER_CONFIG,
  features: {
    ...GENERAL_SCHEDULER_CONFIG.features,
    eventDragCreate: false,
  },
  eventRenderer({ eventRecord, renderData }) {
    const { position, workTime, contractEndDate } = (eventRecord as any)
      .data as ContractConfirmation;
    const contractEndDatetime = DateTime.fromSQL(contractEndDate);

    if (contractEndDatetime.isValid && contractEndDatetime < DateTime.now()) {
      const lastScheduleDay = workTime[workTime.length - 1];
      renderData.cls += lastScheduleDay.status;
    } else {
      renderData.cls += 'pointer-events-none';
    }

    return `
      <div class="flex justify-content-between flex-column w-full">
        <div class="py-1 text-center border-round-bottom-lg" style="background-color: currentColor">
          <span class="text-white">${position}</span>
        </div>

        <div class="flex pb-1">
          ${workTime
            .map(daySchedule => {
              const dayScheduleWidthPercentage: string = `${100 / workTime.length}%`;
              const dayIconTemplate: string = daySchedule.prefilledFromTimeRegistration
                ? "<span class='dps-icon dps-icon-timer text-lg ml-1'></span>"
                : '';

              return `
                <div class="flex justify-content-center align-items-center" style="width: ${dayScheduleWidthPercentage}">
                  <span>${daySchedule.fromTime}</span>
                  <span style="font-size: 20px" class="dps-icon dps-icon-chevron"></span>
                  <span>${daySchedule.toTime || '&nbsp'}</span>

                  ${dayIconTemplate}
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },
} satisfies Partial<SchedulerConfig>;
