import { EventModel } from '@bryntum/scheduler';
import { DateTime, Duration, Interval } from 'luxon';

import {
  ContractConfirmation,
  ContractDayScheduleModel,
  ContractListModel,
  ContractModel,
} from '../models';

export const mapContractToSchedulerEvent = (
  contract: ContractListModel | ContractModel
): ContractListModel & Partial<EventModel> => {
  const { schedule } = contract.timetable;
  const contractStartTime = schedule[0].fromTime;
  const contractLastDaySchedule = schedule[schedule.length - 1];
  const lastDayStartDatetime = DateTime.fromSQL(
    `${contractLastDaySchedule.date} ${contractLastDaySchedule.fromTime}`
  );
  const lastDayEndDatetime = DateTime.fromSQL(
    `${contractLastDaySchedule.date} ${contractLastDaySchedule.toTime}`
  );

  const eventStartDatetime = DateTime.fromSQL(`${contract.dateFrom} ${contractStartTime}`);
  const eventEndDatetime =
    lastDayEndDatetime.diff(lastDayStartDatetime).milliseconds <= 0
      ? lastDayEndDatetime.endOf('day')
      : lastDayEndDatetime;

  return {
    id: contract.id,
    employeeId: contract.employeeId,
    dateFrom: contract.dateFrom,
    dateTo: contract.dateTo,
    position: contract.position,
    status: contract.status,
    timetable: contract.timetable,

    // EventModel properties
    name: contract.position,
    resourceId: contract.employeeId,
    startDate: eventStartDatetime.toJSDate(),
    endDate: eventEndDatetime.toJSDate(),
  };
};

export const mapContractConfirmationToSchedulerEvent = (
  contractConfirmation: ContractConfirmation
): ContractConfirmation & Partial<EventModel> => {
  const schedule = contractConfirmation.workTime;
  const contractStartTime = schedule[0].fromTime;
  const contractLastDaySchedule = schedule[schedule.length - 1];
  const lastDayStartDatetime = DateTime.fromSQL(
    `${contractLastDaySchedule.date} ${contractLastDaySchedule.fromTime}`
  );
  const lastDayEndDatetime = contractLastDaySchedule.toTime
    ? DateTime.fromSQL(`${contractLastDaySchedule.date} ${contractLastDaySchedule.toTime}`)
    : DateTime.fromSQL(contractConfirmation.contractEndDate);

  const eventStartDatetime = DateTime.fromSQL(
    `${contractConfirmation.dateFrom} ${contractStartTime}`
  );
  const eventEndDatetime =
    lastDayEndDatetime.diff(lastDayStartDatetime).milliseconds <= 0
      ? lastDayEndDatetime.endOf('day')
      : lastDayEndDatetime;

  return {
    ...contractConfirmation,

    // EventModel properties
    name: contractConfirmation.position,
    resourceId: contractConfirmation.employeeId,
    startDate: eventStartDatetime.toJSDate(),
    endDate: eventEndDatetime.toJSDate(),
  };
};

export const getContractDayScheduleDatetimes = ({
  date,
  fromTime,
  toTime,
  pauseFromTime,
  pauseToTime,
}: Pick<
  ContractDayScheduleModel,
  'date' | 'fromTime' | 'toTime' | 'pauseFromTime' | 'pauseToTime'
>) => {
  const startDatetime = DateTime.fromSQL(`${date} ${fromTime}`);
  let endDatetime = DateTime.fromSQL(`${date} ${toTime}`);

  if (endDatetime <= startDatetime) {
    endDatetime = endDatetime.plus({ days: 1 });
  }

  if (!pauseFromTime || !pauseToTime) {
    return {
      startDatetime,
      endDatetime,
      pauseStartDatetime: DateTime.invalid('Missing pause start time'),
      pauseEndDatetime: DateTime.invalid('Missing pause end time'),
    };
  }

  let pauseStartDatetime = DateTime.fromSQL(`${date} ${pauseFromTime}`);
  let pauseEndDatetime = DateTime.fromSQL(`${date} ${pauseToTime}`);
  if (pauseStartDatetime < startDatetime) {
    pauseStartDatetime = pauseStartDatetime.plus({ days: 1 });
  }
  if (pauseEndDatetime <= startDatetime) {
    pauseEndDatetime = pauseEndDatetime.plus({ days: 1 });
  }

  return { startDatetime, endDatetime, pauseStartDatetime, pauseEndDatetime };
};

export const calculateContractDuration = (
  daySchedule: Pick<
    ContractDayScheduleModel,
    'date' | 'fromTime' | 'toTime' | 'pauseFromTime' | 'pauseToTime'
  >,
  excludePause: boolean = true
): Duration => {
  const { startDatetime, endDatetime, pauseStartDatetime, pauseEndDatetime } =
    getContractDayScheduleDatetimes(daySchedule);

  const contractDuration = Interval.fromDateTimes(startDatetime, endDatetime).toDuration();
  const pauseDuration = Interval.fromDateTimes(pauseStartDatetime, pauseEndDatetime).toDuration();

  if (excludePause && pauseDuration.isValid) {
    return contractDuration.minus(pauseDuration);
  }

  return contractDuration;
};
