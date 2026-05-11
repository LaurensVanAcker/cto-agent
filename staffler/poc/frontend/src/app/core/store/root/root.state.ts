import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext, NgxsOnInit } from '@ngxs/store';
import { map, tap } from 'rxjs';

import { CompanyDetailModel } from '@dps/shared/models';
import { CompanyApiService, ContractConfirmationApiService } from '@dps/core/api';
import {
  ChangeSidenavVisibility,
  ClearCompanyData,
  GetCompany,
  LoadActualsCount,
  UpdateCompany,
} from './root.actions';
import { RootStateModel } from './root.state.model';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';

@UntilDestroy()
@State<RootStateModel>({
  name: 'root',
  defaults: {
    currentCompany: null,
    currCompanyActualsCount: 0,
    isMobileScreen: false,
    isSidenavVisible: true,
  },
})
@Injectable()
export class RootState implements NgxsOnInit {
  constructor(
    private contractConfirmationApiService: ContractConfirmationApiService,
    private companyApiService: CompanyApiService,
    private breakpointObserver: BreakpointObserver
  ) {}

  ngxsOnInit(ctx: StateContext<RootStateModel>): void {
    this.breakpointObserver
      .observe(Breakpoints.Handset)
      .pipe(
        map(result => result.matches),
        untilDestroyed(this)
      )
      .subscribe(isMobileScreen => {
        ctx.patchState({ isMobileScreen });
        ctx.dispatch(new ChangeSidenavVisibility(!isMobileScreen));
      });
  }

  @Selector()
  static getCompanyData(state: RootStateModel): CompanyDetailModel | null {
    return state.currentCompany;
  }
  @Selector()
  static getCompanyId(state: RootStateModel): string | null {
    return state.currentCompany?.id || null;
  }

  @Selector()
  static getCompanyActualsCount(state: RootStateModel): number {
    return state.currCompanyActualsCount;
  }

  @Selector()
  static isCompanyTimeRegistrationEnabled(state: RootStateModel): boolean {
    return state.currentCompany?.isTimeRegistrationEnabled || false;
  }

  @Selector()
  static isCompanyGroupsEnabled(state: RootStateModel): boolean {
    return state.currentCompany?.isGroupsEnabled || false;
  }

  @Selector()
  static isCompanyActualsEnabled(state: RootStateModel): boolean {
    return state.currentCompany?.isActualsEnabled || false;
  }

  @Selector()
  static isMobileScreen(state: RootStateModel): boolean {
    return state.isMobileScreen;
  }

  @Selector()
  static isSidenavVisible(state: RootStateModel): boolean {
    return state.isSidenavVisible;
  }

  @Action(GetCompany)
  getCompany(ctx: StateContext<RootStateModel>, action: GetCompany) {
    return this.companyApiService.getCompany(action.companyId).pipe(
      tap(company =>
        ctx.patchState({
          currentCompany: company,
        })
      )
    );
  }

  @Action(UpdateCompany)
  updateCompany(ctx: StateContext<RootStateModel>, action: UpdateCompany) {
    ctx.patchState({
      currentCompany: action.payload,
    });
  }

  @Action(LoadActualsCount)
  loadCompanyActualsCount(ctx: StateContext<RootStateModel>, action: LoadActualsCount) {
    const companyId = ctx.getState().currentCompany?.id;
    return this.contractConfirmationApiService
      .getContractsConfirmationsCount(companyId as string)
      .pipe(tap(count => ctx.patchState({ currCompanyActualsCount: count })));
  }

  @Action(ClearCompanyData)
  clearCompanyData(ctx: StateContext<RootStateModel>) {
    ctx.patchState({
      currentCompany: null,
      currCompanyActualsCount: 0,
    });
  }

  @Action(ChangeSidenavVisibility)
  changeSidenavVisibility(ctx: StateContext<RootStateModel>, action: ChangeSidenavVisibility) {
    ctx.patchState({
      isSidenavVisible: action.isVisible,
    });
  }
}
