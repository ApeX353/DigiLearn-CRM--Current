import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email address to send password reset link',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'abc123def456ghi789...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New password (8-128 characters, must contain uppercase, lowercase, and number/special character)',
    example: 'NewSecureP@ssw0rd',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and number/special character',
  })
  new_password: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description: 'Current password for verification (not required if password change is mandated)',
    example: 'OldP@ssw0rd',
    format: 'password',
  })
  @IsString()
  @IsOptional()
  current_password?: string;

  @ApiProperty({
    description: 'New password (8-128 characters, must contain uppercase, lowercase, and number/special character)',
    example: 'NewSecureP@ssw0rd',
    minLength: 8,
    maxLength: 128,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must contain uppercase, lowercase, and number/special character',
  })
  new_password: string;
}
