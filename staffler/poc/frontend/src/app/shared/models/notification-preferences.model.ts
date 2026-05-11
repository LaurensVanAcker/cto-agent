export interface NotificationPreferencesModel {
  id: string;
  userId: string;
  companyId: string;
  phoneNumber: string;
  email: string;
}

export interface NotificationPreferencesScheduleModel {
  id: string;
  userNotificationPreferencesId: string;
  dayOfWeek: number;
  notificationTime: string;
  type: NotificationTypeEnum;
}

export enum NotificationTypeEnum {
  ACTUALS = 'ACTUALS',
  CONTRACT = 'CONTRACT',
}
