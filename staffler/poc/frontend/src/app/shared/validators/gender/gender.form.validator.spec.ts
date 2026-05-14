import { FormControl, FormGroup } from '@angular/forms';
import { GenderEnum } from '@dps/shared/models';
import { GENDER_INVALID_ERROR_NAME, genderFormValidator } from './gender.form.validator';

describe('Gender form validator based on SSN', () => {
  const form = new FormGroup(
    {
      socialSecurityNumber: new FormControl<string | null>(null),
      gender: new FormControl<GenderEnum | null>(null),
    },
    { validators: [genderFormValidator()] }
  );
  const { socialSecurityNumber, gender } = form.controls;

  beforeEach(() => form.reset());

  it('should NOT have errors if SSN or gender fields are empty', () => {
    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should NOT have errors if "OTHER" gender option is selected', () => {
    socialSecurityNumber.setValue('73.03.08-573.62');
    gender.setValue(GenderEnum.OTHER);
    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should have gender error if it does not match with SSN', () => {
    socialSecurityNumber.setValue('73.03.08-573.62');
    gender.setValue(GenderEnum.FEMALE);

    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeTrue();

    socialSecurityNumber.setValue('73.03.08-572.62');
    gender.setValue(GenderEnum.MALE);

    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should NOT have gender error if it matches the SSN', () => {
    socialSecurityNumber.setValue('73.03.08-573.62');
    gender.setValue(GenderEnum.MALE);

    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeFalse();

    socialSecurityNumber.setValue('73.03.08-572.62');
    gender.setValue(GenderEnum.FEMALE);

    expect(form.hasError(GENDER_INVALID_ERROR_NAME)).toBeFalse();
  });
});
