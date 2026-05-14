import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  debounceTime,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';

import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

import { Group } from '@dps/shared/models';
import { CompanyGroupApiService } from '@dps/core/api';
import { RootState } from '@dps/core/store';
import { AssignGroupsDialogData } from './assign-groups-dialog.model';
import { Store } from '@ngxs/store';

@Component({
  selector: 'dps-assign-groups-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TableModule,
    TranslatePipe,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
  ],
  templateUrl: './assign-groups-dialog.component.html',
  styleUrl: './assign-groups-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-column pt-3 h-full gap-3',
  },
})
export class AssignGroupsDialogComponent {
  readonly dialogData: AssignGroupsDialogData = this.dialogService.getInstance(this.dialogRef).data;
  readonly existingGroupsIdsSet = new Set<string>(this.dialogData.existingGroups.map(g => g.id));
  readonly selectedGroups: Group[] = [...this.dialogData.existingGroups];

  readonly groupSearchControl = new FormControl('', { nonNullable: true });
  readonly isLoadingGroups = signal(false);
  readonly companyGroups$ = this.groupSearchControl.valueChanges.pipe(
    debounceTime(200),
    startWith(this.groupSearchControl.value),
    tap(() => this.isLoadingGroups.set(true)),
    withLatestFrom(this.store.select(RootState.getCompanyData).pipe(filter(Boolean))),
    switchMap(([nameLike, company]) =>
      this.companyGroupApiService.getGroups(company.id, { nameLike })
    ),
    map(resp => resp.content),
    tap(() => this.isLoadingGroups.set(false)),
    shareReplay(1)
  );

  constructor(
    private dialogService: DialogService,
    private companyGroupApiService: CompanyGroupApiService,
    private store: Store,
    public dialogRef: DynamicDialogRef
  ) {}

  groupsTrackByFn(_: number, item: Group): string {
    return item.id;
  }
}
