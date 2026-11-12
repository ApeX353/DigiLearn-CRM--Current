import { UserRole, UserRoles } from '../../users/data';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from '@nestjs/class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsEnum(UserRoles)
  roles?: UserRole[];
}