import { Injectable } from '@angular/core';
import Holidays from 'date-holidays';
import { DateTime } from 'luxon';

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private readonly hd = new Holidays('BE');

  isPublicHoliday(date: DateTime): boolean {
    // return !!this.hd.isHoliday(date.toJSDate());
    return false;
  }
}
