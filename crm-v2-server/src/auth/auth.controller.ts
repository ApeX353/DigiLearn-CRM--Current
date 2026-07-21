import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  HttpCode,
  HttpStatus,
  Ip,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { type CookieOptions, type Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { SkipRolesCheck } from './decorators/skip-roles-check.decorator';
import { LoginDto } from './dto/login.dto';
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto/password-reset.dto';
import { RegisterDto } from './dto/register.dto';
import { Enable2FADto, Disable2FADto } from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';

const REFRESH_COOKIE_NAME = 'crm_auth.session_token';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_SETTINGS: CookieOptions = {
  httpOnly: true,
  // In production the site is served over HTTPS and the API may live on a
  // different site, so SameSite=None + Secure is required. In development the
  // client (localhost:5173) and the API (localhost:3001) are the same site,
  // so SameSite=Lax works and we can drop Secure so browsers keep the cookie
  // over plain HTTP — otherwise logins silently fail in strict Chromium setups.
  secure: IS_PRODUCTION,
  sameSite: IS_PRODUCTION ? 'none' : 'lax',
  path: '/api/v2/auth/refresh',
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  @Public()
  @SkipRolesCheck()
  @Post('register')
  @ApiOperation({
    summary: 'Register new user',
    description:
      'Create a new user account with email and password. Automatically assigns default student role.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description:
      'User successfully registered. Returns access token, refresh token, and user info.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'a1b2c3d4e5f6...',
        expires_in: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john.doe@example.com',
          first_name: 'John',
          last_name: 'Doe',
          roles: ['sales_rep'],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid input or user already exists',
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    // This CRM has no self-service signup: accounts are provisioned by
    // admins via the users module. The endpoint stays only for bootstrap
    // tooling and must be explicitly enabled per environment.
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      throw new ForbiddenException('Public registration is disabled');
    }
    return this.authService.register(
      registerDto,
      ipAddress,
      false,
      req.headers.origin,
    );
  }

  @Public()
  @SkipRolesCheck()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticate user with email and password. Include 2FA code if two-factor authentication is enabled. Creates a new session and returns JWT tokens. If password change is required or password has expired, response will include requires_password_change flag.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description:
      'Successfully authenticated. Returns access token, refresh token, and user info. May include requires_password_change flag.',
    schema: {
      oneOf: [
        {
          title: 'Normal Login',
          example: {
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refresh_token: 'a1b2c3d4e5f6...',
            expires_in: 900,
            user: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              email: 'john.doe@example.com',
              first_name: 'John',
              last_name: 'Doe',
              roles: ['teacher', 'admin'],
            },
          },
        },
        {
          title: 'Password Change Required',
          example: {
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refresh_token: 'a1b2c3d4e5f6...',
            expires_in: 900,
            user: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              email: 'john.doe@example.com',
              first_name: 'John',
              last_name: 'Doe',
              roles: ['teacher'],
            },
            requires_password_change: true,
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - Invalid credentials, account locked, or invalid 2FA code',
  })
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string,
    @Req() req: Request,
  ) {
    const userAgent = req.headers['user-agent'];
    const { refresh_token, ...tokens } = await this.authService.login(
      loginDto,
      ipAddress,
      userAgent,
    );

    req.res?.cookie(REFRESH_COOKIE_NAME, refresh_token, COOKIE_SETTINGS);

    return tokens;
  }

  @Public()
  @SkipRolesCheck()
  @Get('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Get a new access token using a valid refresh token. Refresh tokens are long-lived (30 days) while access tokens expire after 15 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'New access token generated successfully.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 900,
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john.doe@example.com',
          first_name: 'John',
          last_name: 'Doe',
          roles: ['teacher'],
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired refresh token',
  })
  async refresh(@Ip() ipAddress: string, @Req() req: Request) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('No refresh token found');
    }
    const { refresh_token, ...newTokens } = await this.authService.refreshToken(
      { refresh_token: token },
      ipAddress,
    );
    req.res?.cookie(REFRESH_COOKIE_NAME, refresh_token, COOKIE_SETTINGS);
    return newTokens;
  }

  @SkipRolesCheck()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout',
    description:
      'Revoke the current session by invalidating the refresh token. The access token will remain valid until expiration.',
  })
  @ApiResponse({ status: 204, description: 'Successfully logged out' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async logout(@Req() req: Request) {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('No refresh token found');
    }
    await this.authService.logout(token);
    req.res?.clearCookie(REFRESH_COOKIE_NAME);
  }

  @SkipRolesCheck()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout from all sessions',
    description:
      'Revoke all active sessions for the current user. Useful when user suspects account compromise or wants to force re-authentication on all devices.',
  })
  @ApiResponse({
    status: 204,
    description: 'All sessions successfully revoked',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async logoutAll(@CurrentUser('id') userId: string) {
    await this.authService.logoutAllSessions(userId);
  }

  @Public()
  @Post('password/request-reset')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Password Management')
  @ApiOperation({
    summary: 'Request password reset',
    description:
      "Send a password reset token to the user email. For security, always returns success even if email doesn't exist.",
  })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset request processed',
    schema: {
      example: {
        message: 'If the email exists, a password reset link has been sent',
      },
    },
  })
  async requestPasswordReset(
    @Body() dto: RequestPasswordResetDto,
    @Req() req: Request,
  ) {
    await this.authService.requestPasswordReset(dto, req.headers.origin);
    return {
      message: 'If the email exists, a password reset link has been sent',
    };
  }

  @Public()
  @SkipRolesCheck()
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiTags('Password Management')
  @ApiOperation({
    summary: 'Reset password',
    description:
      'Reset password using the token sent via email. Token expires after 1 hour. All active sessions will be revoked.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successful',
    schema: {
      example: {
        message: 'Password has been reset successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid or expired reset token',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password has been reset successfully' };
  }

  @SkipRolesCheck()
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Password Management')
  @ApiOperation({
    summary: 'Change password',
    description:
      'Change password for authenticated user. Current password is required for voluntary changes but optional when password change is mandated (first-time login, expired password). After successful password change, all sessions are revoked and user must re-login.',
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({
    status: 200,
    description:
      'Password changed successfully. All sessions have been revoked - please login again with new password.',
    schema: {
      example: {
        message: 'Password changed successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad request - Current password required for voluntary changes',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid current password or missing JWT token',
  })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  @SkipRolesCheck()
  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieve profile information for the authenticated user including roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'john.doe@example.com',
        first_name: 'John',
        last_name: 'Doe',
        roles: ['teacher', 'admin'],
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async getProfile(@CurrentUser() user: any) {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      roles: user.roles?.map((role: any) => role.name) || [],
    };
  }

  // 2FA Endpoints
  @SkipRolesCheck()
  @Post('2fa/generate')
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Two-Factor Authentication')
  @ApiOperation({
    summary: 'Generate 2FA secret',
    description:
      'Generate TOTP secret and QR code for two-factor authentication setup. Also generates 10 backup codes. 2FA is not enabled until verified.',
  })
  @ApiResponse({
    status: 201,
    description: '2FA secret generated successfully',
    schema: {
      example: {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        backupCodes: [
          'AAAABBBB',
          'CCCCDDDD',
          'EEEEFFFF',
          'GGGGHHHH',
          'IIIIJJJJ',
          'KKKKLLLL',
          'MMMMNNNN',
          'OOOOPP PP',
          'QQQQRRRR',
          'SSSSTTTT',
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - 2FA is already enabled',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async generate2FA(@CurrentUser('id') userId: string) {
    return this.twoFactorService.generate2FASecret(userId);
  }

  @SkipRolesCheck()
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Two-Factor Authentication')
  @ApiOperation({
    summary: 'Enable 2FA',
    description:
      'Enable two-factor authentication by verifying the TOTP code from your authenticator app. Must call /2fa/generate first.',
  })
  @ApiBody({ type: Enable2FADto })
  @ApiResponse({
    status: 200,
    description: '2FA enabled successfully',
    schema: {
      example: {
        message: '2FA enabled successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - 2FA secret not generated or already enabled',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid 2FA code or missing JWT token',
  })
  async enable2FA(
    @CurrentUser('id') userId: string,
    @Body() dto: Enable2FADto,
  ) {
    await this.twoFactorService.enable2FA(userId, dto.code);
    return { message: '2FA enabled successfully' };
  }

  @SkipRolesCheck()
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Two-Factor Authentication')
  @ApiOperation({
    summary: 'Disable 2FA',
    description:
      'Disable two-factor authentication. Requires verification with TOTP code or backup code.',
  })
  @ApiBody({ type: Disable2FADto })
  @ApiResponse({
    status: 200,
    description: '2FA disabled successfully',
    schema: {
      example: {
        message: '2FA disabled successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - 2FA is not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid 2FA code or missing JWT token',
  })
  async disable2FA(
    @CurrentUser('id') userId: string,
    @Body() dto: Disable2FADto,
  ) {
    await this.twoFactorService.disable2FA(userId, dto.code);
    return { message: '2FA disabled successfully' };
  }

  @SkipRolesCheck()
  @Post('2fa/regenerate-backup-codes')
  @ApiBearerAuth('JWT-auth')
  @ApiTags('Two-Factor Authentication')
  @ApiOperation({
    summary: 'Regenerate backup codes',
    description:
      'Generate new set of 10 backup codes. Previous backup codes will be invalidated. Only available when 2FA is enabled.',
  })
  @ApiResponse({
    status: 201,
    description: 'Backup codes regenerated successfully',
    schema: {
      example: {
        backupCodes: [
          'AAAABBBB',
          'CCCCDDDD',
          'EEEEFFFF',
          'GGGGHHHH',
          'IIIIJJJJ',
          'KKKKLLLL',
          'MMMMNNNN',
          'OOOOPP PP',
          'QQQQRRRR',
          'SSSSTTTT',
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - 2FA is not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
  })
  async regenerateBackupCodes(@CurrentUser('id') userId: string) {
    const backupCodes =
      await this.twoFactorService.regenerateBackupCodes(userId);
    return { backupCodes };
  }
}
