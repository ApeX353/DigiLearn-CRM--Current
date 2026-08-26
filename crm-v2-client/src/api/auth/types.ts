export interface LoginRequest {
  email: string;
  password: string;
  two_factor_code?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    roles: string[];
    avatar_url: string;
  };
  requires_password_change?: boolean;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface ChangePasswordRequest {
  current_password?: string;
  new_password: string;
}

export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface Enable2FARequest {
  code: string;
}

export interface Disable2FARequest {
  code: string;
}

export interface Generate2FAResponse {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MessageResponse {
  message: string;
}
