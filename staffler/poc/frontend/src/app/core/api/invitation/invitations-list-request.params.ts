import { EmployeeInvitationStatusEnum, PageableRequestParamsModel } from '@dps/shared/models';

export interface InvitationsListRequestParams extends PageableRequestParamsModel {
  companyId: string;
  status?: Array<EmployeeInvitationStatusEnum>;
}

export interface InvitationPayloadModel {
  companyId: string;
  status: string;
  id: string;
}
