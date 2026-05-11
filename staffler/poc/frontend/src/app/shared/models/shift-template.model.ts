export interface ShiftTemplateModel {
  id: string;
  name: string;
  fromTime: string;
  toTime: string;
  pauseFromTime: string | null;
  pauseToTime: string | null;
}
