import { FormControl } from '@angular/forms';
import { NAME_INVALID_ERROR_NAME, nameValidator } from './name.validator';

describe('Name validator', () => {
  const nameControl = new FormControl<string | null>(null, nameValidator());

  beforeEach(() => nameControl.reset());

  it('should have error if name include number or symbol', () => {
    nameControl.setValue('Adam123');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeTrue();

    nameControl.setValue('Adam@$');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should have error if first letter not capitalize', () => {
    nameControl.setValue('adam');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();

    nameControl.setValue('adam-Cat');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should NOT have error if name is valid', () => {
    nameControl.setValue('Adamé-Macôn');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();

    nameControl.setValue('Abdülkadir');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();

    nameControl.setValue("Tom D'herde");
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should NOT have error if name has all capital letters', () => {
    nameControl.setValue('ADAM');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();

    nameControl.setValue('ADAMÉ-MACÔN');
    expect(nameControl.hasError(NAME_INVALID_ERROR_NAME)).toBeFalse();
  });
});
