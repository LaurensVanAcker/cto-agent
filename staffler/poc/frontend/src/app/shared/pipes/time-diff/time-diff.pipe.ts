import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DateTime } from 'luxon';

@Pipe({
  name: 'timeDiff',
  standalone: true,
  pure: true,
})
export class TimeDiffPipe implements PipeTransform {
  private readonly translateService = inject(TranslateService);
  getDurationInMinutes(start: string | null | undefined, end?: string | null): number {
    const today = DateTime.now();
    const baseDate = DateTime.fromObject({
      year: today.year,
      month: today.month,
      day: today.day,
    });

    const startTime = start
      ? DateTime.fromFormat(start, 'HH:mm').set({
          year: baseDate.year,
          month: baseDate.month,
          day: baseDate.day,
        })
      : DateTime.now();

    const endTime = end
      ? DateTime.fromFormat(end, 'HH:mm').set({
          year: baseDate.year,
          month: baseDate.month,
          day: baseDate.day,
        })
      : DateTime.now();

    let diff = endTime.diff(startTime, 'minutes').as('minutes');

    if (diff < 0) {
      diff = endTime.plus({ days: 1 }).diff(startTime, 'minutes').as('minutes');
    }
    return Math.floor(diff);
  }

  formatMinutes(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} ${this.translateService.instant('COMPANY_TIME_REGISTRATION.HOURS')} ${minutes} min`;
  }

  transform(value: string | null, end?: string): string {
    const minutes = this.getDurationInMinutes(value, end);
    return this.formatMinutes(minutes);
  }
}
