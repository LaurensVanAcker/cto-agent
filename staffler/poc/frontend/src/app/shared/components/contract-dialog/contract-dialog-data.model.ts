import { EventModel } from '@bryntum/scheduler';
import { EmployeeModel } from '@dps/shared/models';

export interface ContractDialogDataModel {
  contractEventRecord: EventModel;
  employee: EmployeeModel;
}
