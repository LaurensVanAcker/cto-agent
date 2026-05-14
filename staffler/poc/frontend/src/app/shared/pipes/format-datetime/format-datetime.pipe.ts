import { Pipe, PipeTransform } from '@angular/core';
import { DateTime } from 'luxon';

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  ...DateTime.DATE_SHORT,
  day: '2-digit',
  month: '2-digit',
}; // 25/10/2024

@Pipe({
  name: 'formatDatetime',
  standalone: true,
})
export class FormatDatetimePipe implements PipeTransform {
  transform(value: string, format: Intl.DateTimeFormatOptions = DEFAULT_FORMAT): string {
    const datetime = DateTime.fromJSDate(new Date(value));
    return datetime.toLocaleString(format);
  }
}
