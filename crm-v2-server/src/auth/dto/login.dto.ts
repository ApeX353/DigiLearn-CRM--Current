import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'SecureP@ssw0rd',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Two-factor authentication code (required if 2FA is enabled). Can be TOTP code or backup code.',
    example: '123456',
    minLength: 6,
    maxLength: 8,
  })
  @IsOptional()
  @IsString()
  two_factor_code?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token obtained from login or previous refresh',
    example: 'a1b2c3d4e5f6g7h8i9j0...',
  })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token to revoke',
    example: 'a1b2c3d4e5f6g7h8i9j0...',
  })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}
