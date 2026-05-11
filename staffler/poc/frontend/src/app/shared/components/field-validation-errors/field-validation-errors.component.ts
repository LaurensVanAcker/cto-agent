import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  Input,
  OnInit,
} from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { TranslatePipe } from '@ngx-translate/core';
import { combineLatest, debounceTime } from 'rxjs';

@UntilDestroy()
@Component({
  selector: 'dps-field-validation-errors',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './field-validation-errors.component.html',
  styleUrl: './field-validation-errors.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldValidationErrorsComponent implements OnInit {
  @Input({ required: true }) control!: AbstractControl;

  @HostBinding('class.hidden') get isHidden(): boolean {
    return this.control.untouched || this.control.valid;
  }

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    combineLatest([this.control.statusChanges, this.control.valueChanges])
      .pipe(debounceTime(200), untilDestroyed(this))
      .subscribe(() => this.cd.markForCheck());
  }
}
