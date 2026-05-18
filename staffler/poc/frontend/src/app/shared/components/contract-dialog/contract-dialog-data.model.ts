import { EventModel } from '@bryntum/scheduler';
import { EmployeeModel } from '@dps/shared/models';

export interface ContractDialogDataModel {
  contractEventRecord: EventModel;
  employee: EmployeeModel;
  /**
   * Optional ISO date (YYYY-MM-DD) used to seed the datepicker in create
   * mode. Set this from the planning surface when the user clicks an
   * empty cell or drags to create — the dialog will pre-fill the date
   * picker with the cell's date instead of "today".
   *
   * If omitted, the dialog falls back to reading `startDate`/`endDate`
   * from the Bryntum event record (legacy behaviour).
   */
  initialDate?: string;
  /**
   * When true the dialog hides the "Vestiging / werkplek" field — used
   * by the Medewerkers-planning surface where the wage-pakket's address
   * is the implicit context and the operator cannot override it.
   */
  hideServiceLocation?: boolean;
}
