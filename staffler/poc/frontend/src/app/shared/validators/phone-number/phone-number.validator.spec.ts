import { FormControl } from '@angular/forms';
import { PHONE_NUMBER_INVALID_ERROR_NAME, phoneNumberValidator } from './phone-number.validator';

describe('Phone number validator', () => {
  const phoneControl = new FormControl<string | null>(null, phoneNumberValidator());

  beforeEach(() => phoneControl.reset());

  it('should NOT have error if phone number is empty or null', () => {
    expect(phoneControl.hasError(PHONE_NUMBER_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should NOT have error if phone number is valid', () => {
    phoneControl.setValue('+32 465 90 68 64');
    expect(phoneControl.hasError(PHONE_NUMBER_INVALID_ERROR_NAME)).toBeFalse();

    phoneControl.setValue('+32465906864');
    expect(phoneControl.hasError(PHONE_NUMBER_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should have error if phone number is invalid', () => {
    phoneControl.setValue('+32 753 22 33 44');
    expect(phoneControl.hasError(PHONE_NUMBER_INVALID_ERROR_NAME)).toBeTrue();

    phoneControl.setValue('+327532233');
    expect(phoneControl.hasError(PHONE_NUMBER_INVALID_ERROR_NAME)).toBeTrue();
  });
});
