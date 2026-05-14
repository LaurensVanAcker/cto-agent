import { CompanyDetailModel } from '@dps/shared/models';

export interface RootStateModel {
  currentCompany: CompanyDetailModel | null;
  currCompanyActualsCount: number;
  isMobileScreen: boolean;
  isSidenavVisible: boolean;
}
