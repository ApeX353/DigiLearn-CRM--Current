import { BadRequestException } from '@nestjs/common';
import { OneOfPipe } from './one-of.pipe';

describe('OneOfPipe', () => {
  const pipe = new OneOfPipe(['Draft', 'Sent', 'Paid'] as const, 'status');

  it('passes an allowed value through unchanged', () => {
    expect(pipe.transform('Sent')).toBe('Sent');
  });

  it('refuses an unknown value with the allowed list in the message', () => {
    expect(() => pipe.transform('DefinitelyInvalid')).toThrow(BadRequestException);
    expect(() => pipe.transform('DefinitelyInvalid')).toThrow(
      'status "DefinitelyInvalid" is not valid; expected one of: Draft, Sent, Paid',
    );
  });

  it('refuses a missing value as missing, not as "undefined"', () => {
    expect(() => pipe.transform(undefined)).toThrow('status missing is not valid');
    expect(() => pipe.transform('')).toThrow('status missing is not valid');
  });

  it('refuses non-string values such as numbers', () => {
    expect(() => pipe.transform(123)).toThrow('status "123" is not valid');
  });

  it('is case-sensitive, matching the database enum', () => {
    expect(() => pipe.transform('sent')).toThrow(BadRequestException);
  });
});
