import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BehaviorSubject, Observable, filter, switchMap, tap } from 'rxjs';

import { PanelModule } from 'primeng/panel';
import { ButtonModule } from 'primeng/button';
import { DialogService, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SkeletonModule } from 'primeng/skeleton';

import { CompanyBaseModel, EmployeeModel, EmployeeWageModel } from '@dps/shared/models';
import { EmployeeWageApiService } from '@dps/core/api';
import { EmployeeWageDialogDataModel } from '../employee-wage-dialog/employee-wage-dialog-data.model';
import { EmployeeWageDialogComponent } from '../employee-wage-dialog/employee-wage-dialog.component';
import { EmployeeProfileQueryParamEnum } from '../../employee.routes.model';

@Component({
  selector: 'dps-company-wages-list',
  imports: [CommonModule, TranslatePipe, PanelModule, ButtonModule, SkeletonModule],
  providers: [DialogService],
  templateUrl: './company-wages-list.component.html',
  styleUrl: './company-wages-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyWagesListComponent implements OnInit {
  @Input({ required: true }) employee!: EmployeeModel | null;
  @Input({ required: true }) company!: CompanyBaseModel;
  @Input() allowRemoveWage!: boolean;

  @Output() wageUpdated = new EventEmitter<void>();

  readonly isLoadingWages$ = new BehaviorSubject<boolean>(true);
  readonly reloadWagesTrigger$ = new BehaviorSubject<void>(undefined);
  wages$!: Observable<Array<EmployeeWageModel>>;

  constructor(
    private employeeWageApiService: EmployeeWageApiService,
    private dialogService: DialogService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.wages$ = this.reloadWagesTrigger$.asObservable().pipe(
      tap(() => this.isLoadingWages$.next(true)),
      switchMap(() =>
        this.employeeWageApiService.getEmployeeWages({
          employeeId: this.employee?.id as string,
          companyId: this.company.companyId,
        })
      ),
      tap(() => this.isLoadingWages$.next(false)),
      tap(wages => {
        const openedWageId = this.route.snapshot.queryParamMap.get(
          EmployeeProfileQueryParamEnum.OPENED_WAGE_ID
        );
        if (!openedWageId) return;
        const openedWage = wages.find(wage => wage.id === openedWageId);
        if (!openedWage) return;
        this.openWageDialog(openedWage);
      })
    );
  }

  openWageDialog(wage?: EmployeeWageModel): void {
    const dialogConfig: DynamicDialogConfig<EmployeeWageDialogDataModel> = {
      modal: true,
      showHeader: false,
      styleClass: 'overflow-hidden',
      width: '800px',
      data: {
        employee: this.employee as EmployeeModel,
        company: this.company,
        wage,
      },
    };

    if (wage) {
      this.router.navigate([], {
        queryParams: { [EmployeeProfileQueryParamEnum.OPENED_WAGE_ID]: wage.id },
      });
    }

    this.dialogService
      .open(EmployeeWageDialogComponent, dialogConfig)
      .onClose.pipe(
        tap(() =>
          this.router.navigate([], {
            queryParams: { [EmployeeProfileQueryParamEnum.OPENED_WAGE_ID]: null },
          })
        ),
        filter(Boolean)
      )
      .subscribe(() => {
        this.reloadWagesTrigger$.next();
        if (wage) {
          this.wageUpdated.emit();
        }
      });
  }

  removeWage(wage: EmployeeWageModel): void {
    this.employeeWageApiService
      .removeWage(wage.id)
      .subscribe(() => this.reloadWagesTrigger$.next());
  }
}
