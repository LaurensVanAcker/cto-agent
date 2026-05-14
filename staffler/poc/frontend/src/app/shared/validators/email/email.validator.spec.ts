import { AbstractControl, FormControl } from '@angular/forms';
import { EMAIL_INVALID_ERROR_NAME, emailValidator } from './email.validator';

describe('Email validator', () => {
  const emailControl = new FormControl<string | null>(null, emailValidator());

  beforeEach(() => emailControl.reset());

  it('should NOT have error if email is empty or null', () => {
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeFalse();

    emailControl.setValue('');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeFalse();
  });

  it('should have error if email contains chars other than allowed (alphanumeric . _ @ -)', () => {
    emailControl.setValue('test,123@com');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeTrue();

    emailControl.setValue('test&toast.com');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should have error if email contains allowed chars but has wrong format', () => {
    emailControl.setValue('test.com');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeTrue();

    emailControl.setValue('test@com');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeTrue();

    emailControl.setValue('test@com..');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeTrue();
  });

  it('should NOT have error if email contains allowed chars and has right format', () => {
    emailControl.setValue('x@x.x');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeFalse();

    emailControl.setValue('ASD.TEST@gmail.com.be');
    expect(emailControl.hasError(EMAIL_INVALID_ERROR_NAME)).toBeFalse();
  });
});
