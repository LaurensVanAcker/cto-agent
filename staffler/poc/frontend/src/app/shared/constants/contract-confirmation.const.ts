import { DateTime, Duration, Interval } from 'luxon';

export const MIN_CONTRACT_CONFIRMATION_DAY_DURATION = Duration.fromObject({ hours: 2 });

export const PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL = Interval.fromDateTimes(
  DateTime.fromObject({ weekday: 1, hour: 23, minute: 59 }),
  DateTime.fromObject({ weekday: 2, hour: 20 })
);

export const PAST_CONTRACT_CONFIRMATIONS_UPDATE_PROHIBITED_INTERVAL_PUBLIC_HOLIDAY =
  Interval.fromDateTimes(
    DateTime.fromObject({ weekday: 1, hour: 13 }),
    DateTime.fromObject({ weekday: 2, hour: 20 })
  );
