import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Enable2FADto {
  @ApiProperty({
    description: '6-digit TOTP code from authenticator app to verify and enable 2FA',
    example: '123456',
    minLength: 6,
    maxLength: 6,
    pattern: '^[0-9]{6}$',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

export class Verify2FADto {
  @ApiProperty({
    description: '6-digit TOTP code from authenticator app for verification',
    example: '654321',
    minLength: 6,
    maxLength: 6,
    pattern: '^[0-9]{6}$',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

export class Disable2FADto {
  @ApiProperty({
    description: '6-digit TOTP code or backup code to disable 2FA',
    example: '789012',
    minLength: 6,
    maxLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
