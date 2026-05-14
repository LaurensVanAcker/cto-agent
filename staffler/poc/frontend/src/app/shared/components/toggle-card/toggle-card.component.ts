import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';

import { ToggleSwitch } from 'primeng/toggleswitch';

@Component({
  selector: 'dps-toggle-card',
  standalone: true,
  imports: [CommonModule, FormsModule, ToggleSwitch],
  templateUrl: './toggle-card.component.html',
  styleUrl: './toggle-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('toggleSection', [
      state('collapsed', style({ height: 0 })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms ease-in')),
    ]),
  ],
  host: {
    class: 'flex flex-column border-1 border-round border-300 overflow-hidden',
  },
})
export class ToggleCardComponent {
  @Input({ required: true }) title: string = '';
  @Input({ transform: booleanAttribute }) toggled = false;
  @Output() toggleChange = new EventEmitter<boolean>();
  @Input() disabled!: boolean;
}
