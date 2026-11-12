import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address (must be unique)',
    example: 'jane.smith@example.com',
    format: 'email',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Password (8-128 characters, must contain uppercase, lowercase, and number/special character)',
    example: 'SecureP@ssw0rd',
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
  password: string;

  @ApiProperty({
    description: 'User first name (2-50 characters)',
    example: 'Jane',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  first_name: string;

  @ApiProperty({
    description: 'User last name (2-50 characters)',
    example: 'Smith',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  last_name: string;
}
