import { FormBuilder, Validators } from '@angular/forms';
import {
  NEW_PASSWORD_MIN_LENGTH,
  NewPasswordFormValidationErrorsEnum,
  newPasswordFormValidator,
} from './new-password-form.validator';

describe('newPasswordFormValidator', () => {
  const fb = new FormBuilder();
  const form = fb.group(
    {
      password: fb.nonNullable.control('', Validators.required),
      repeatPassword: fb.nonNullable.control('', Validators.required),
    },
    { validators: newPasswordFormValidator('password', 'repeatPassword') }
  );

  afterEach(() => form.reset());

  it(`should have ${NewPasswordFormValidationErrorsEnum.HAS_NUMBER} error when password does not contain a number`, () => {
    form.setValue({
      password: 'Abcdefgh!',
      repeatPassword: 'Abcdefgh!',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.HAS_NUMBER)).toBeTrue();
  });

  it(`should have ${NewPasswordFormValidationErrorsEnum.HAS_SPECIAL_CHAR} error when password does not contain a special character`, () => {
    form.setValue({
      password: 'Abc123456',
      repeatPassword: 'Abc123456',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.HAS_SPECIAL_CHAR)).toBeTrue();
  });

  it(`should have ${NewPasswordFormValidationErrorsEnum.HAS_UPPERCASE_LETTER} error when password does not contain an uppercase letter`, () => {
    form.setValue({
      password: 'abc123!@#',
      repeatPassword: 'abc123!@#',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.HAS_UPPERCASE_LETTER)).toBeTrue();
  });

  it(`should have ${NewPasswordFormValidationErrorsEnum.HAS_LOWERCASE_LETTER} error when password does not contain a lowercase letter`, () => {
    form.setValue({
      password: 'ABC123!@#',
      repeatPassword: 'ABC123!@#',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.HAS_LOWERCASE_LETTER)).toBeTrue();
  });

  it(`should have ${NewPasswordFormValidationErrorsEnum.HAS_MIN_LENGTH} error when password length is less than ${NEW_PASSWORD_MIN_LENGTH} characters`, () => {
    form.setValue({
      password: 'Abc123!',
      repeatPassword: 'Abc123!',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.HAS_MIN_LENGTH)).toBeTrue();
  });

  it(`should have ${NewPasswordFormValidationErrorsEnum.PASSWORDS_MATCH} error when passwords do not match`, () => {
    form.setValue({
      password: 'Abc123!@#',
      repeatPassword: 'Abc1234!@#',
    });

    expect(form.hasError(NewPasswordFormValidationErrorsEnum.PASSWORDS_MATCH)).toBeTrue();
  });

  it(`should NOT have any errors when passwords meet all requirements`, () => {
    form.setValue({
      password: 'Abc123!@#',
      repeatPassword: 'Abc123!@#',
    });

    expect(form.errors).toBeNull();
  });
});
