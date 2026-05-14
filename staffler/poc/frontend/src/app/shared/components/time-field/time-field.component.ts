import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DateTime } from 'luxon';

import { InputTextModule } from 'primeng/inputtext';

const HOURS_IN_DAY = 24;
const MINUTES_IN_HOUR = 60;

const DIGIT_REGEX = /^\d$/;
const TIME_REGEX = /^(\d{1,2}):?(\d?)(\d?)$/;

@Component({
  selector: 'dps-time-field',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule],
  templateUrl: './time-field.component.html',
  styleUrl: './time-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-6rem' },
})
export class TimeFieldComponent {
  @Input({ required: true }) control!: FormControl<string | null>;

  formatTime(event: FocusEvent): void {
    const fieldValue = (event.target as HTMLInputElement).value;
    const timeMatch = fieldValue.match(TIME_REGEX);
    if (!timeMatch) return;

    const [_, hours, firstMinuteDigit, secondMinuteDigit] = timeMatch;
    const hoursNumber = Number(hours);
    const minutesNumber = Number(`${firstMinuteDigit || 0}${secondMinuteDigit || 0}`);
    const formattedTime: string | null =
      hoursNumber < HOURS_IN_DAY && minutesNumber < MINUTES_IN_HOUR
        ? DateTime.now()
            .set({ hour: hoursNumber, minute: minutesNumber })
            .toLocaleString(DateTime.TIME_24_SIMPLE)
        : null;

    this.control?.setValue(formattedTime);
  }

  onKeyPress(event: KeyboardEvent): boolean {
    return DIGIT_REGEX.test(event.key);
  }
}
