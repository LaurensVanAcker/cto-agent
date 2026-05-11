import { CompanyBaseModel, EmployeeModel, EmployeeWageModel } from '@dps/shared/models';

export interface EmployeeWageDialogDataModel {
  employee: EmployeeModel;
  company: CompanyBaseModel;
  wage?: EmployeeWageModel;
}
