import { ConsultantModel } from './consultant.model';

export interface StudentBalanceModel {
  balance: number | null;
  updatedAt: string | null;
  changedByConsultant: ConsultantModel | null;
  changedByContract: {
    id: string;
    allocationId: string;
    contractNumber: string;
  } | null;
}
