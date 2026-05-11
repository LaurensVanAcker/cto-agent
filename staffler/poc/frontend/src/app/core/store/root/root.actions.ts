import { RootStateModel } from './root.state.model';

export class GetCompany {
  static readonly type = '[Root] Get Company';
  constructor(public companyId: string) {}
}

export class UpdateCompany {
  static readonly type = '[Root] Update Company';
  constructor(public payload: RootStateModel['currentCompany']) {}
}

export class LoadActualsCount {
  static readonly type = '[Root] Load Company Actuals Count';
}

export class ClearCompanyData {
  static readonly type = '[Root] Clear Company Data';
}

export class ChangeSidenavVisibility {
  static readonly type = '[Root] Change Sidenav Visibility';
  constructor(public isVisible: boolean) {}
}
