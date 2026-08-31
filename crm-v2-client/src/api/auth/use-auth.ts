import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { apiClient, apiClientAuth, handleApiError } from '~/api/axios'
import { useAuthStore, type User } from '~/stores/use-auth-store'
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  LogoutRequest,
  ChangePasswordRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  Enable2FARequest,
  Disable2FARequest,
  Generate2FAResponse,
  MessageResponse,
} from './types'

// Query keys
export const authKeys = {
  all: ['auth'] as const,
  profile: () => [...authKeys.all, 'profile'] as const,
}

// API functions
const authApi = {
  login: (data: LoginRequest): Promise<AuthResponse> =>
    apiClient.post('/auth/login', data).then((res) => res.data),

  register: (data: RegisterRequest): Promise<AuthResponse> =>
    apiClient.post('/auth/register', data).then((res) => res.data),

  logout: (data: LogoutRequest): Promise<void> =>
    apiClientAuth.post('/auth/logout', data).then((res) => res.data),

  logoutAll: (): Promise<void> =>
    apiClientAuth.post('/auth/logout-all').then((res) => res.data),

  getProfile: (): Promise<User> =>
    apiClientAuth.get('/auth/profile').then((res) => res.data),

  changePassword: (data: ChangePasswordRequest): Promise<MessageResponse> =>
    apiClientAuth.post('/auth/password/change', data).then((res) => res.data),

  requestPasswordReset: (data: RequestPasswordResetRequest): Promise<MessageResponse> =>
    apiClient.post('/auth/password/request-reset', data).then((res) => res.data),

  resetPassword: (data: ResetPasswordRequest): Promise<MessageResponse> =>
    apiClient.post('/auth/password/reset', data).then((res) => res.data),

  generate2FA: (): Promise<Generate2FAResponse> =>
    apiClientAuth.post('/auth/2fa/generate').then((res) => res.data),

  enable2FA: (data: Enable2FARequest): Promise<MessageResponse> =>
    apiClientAuth.post('/auth/2fa/enable', data).then((res) => res.data),

  disable2FA: (data: Disable2FARequest): Promise<MessageResponse> =>
    apiClientAuth.post('/auth/2fa/disable', data).then((res) => res.data),

  regenerateBackupCodes: (): Promise<{ backupCodes: string[] }> =>
    apiClientAuth.post('/auth/2fa/regenerate-backup-codes').then((res) => res.data),
}

/** Warn this many days ahead of the 90-day password expiry. */
const PASSWORD_EXPIRY_WARNING_DAYS = 14

/**
 * Tell the user their password is ageing, without ever getting in their way.
 *
 * Stays quiet until the last two weeks, so it does not become noise people
 * learn to dismiss without reading. Once the date has passed it keeps saying
 * so on every login — nagging is the whole point at that stage — but it still
 * never blocks anything.
 */
function notifyPasswordExpiry(
  expiry: AuthResponse['password_expiry'],
  onChangeNow: () => void,
) {
  if (!expiry) return

  const { days_remaining: days, expired } = expiry
  if (!expired && days > PASSWORD_EXPIRY_WARNING_DAYS) return

  const message = expired
    ? days === 0
      ? 'Your password expires today'
      : `Your password expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
    : `Your password expires in ${days} day${days === 1 ? '' : 's'}`

  toast.warning(message, {
    description: 'You can keep working. Change it when it suits you.',
    duration: expired ? 10000 : 6000,
    action: { label: 'Change now', onClick: onChangeNow },
  })
}

// Hooks
export function useLogin() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      try {
        return await authApi.login(data)
      } catch (error) {
        throw new Error(handleApiError(error))
      }
    },
    onSuccess: (data) => {
      setAuth(
        data.access_token,
        data.user,
        data.requires_password_change
      )

      // A FORCED change is the only thing that takes over the session.
      if (data.requires_password_change) {
        navigate('/change-password')
        return
      }

      navigate('/')

      // Password expiry is a reminder, not a gate. It used to share the flag
      // above, so once the 90-day timer rolled over — which it did for every
      // account at once — people were dumped on /change-password and could
      // not use the CRM. Tell them, let them get on with their work, and give
      // them a one-click route to fix it when they choose.
      notifyPasswordExpiry(data.password_expiry, () =>
        navigate('/change-password'),
      )
    },
  })
}

export function useRegister() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (data) => {
      setAuth(data.access_token, data.user)
      navigate('/dashboard')
    },
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useLogout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((state) => state.clearAuth)
  const { token } = useAuthStore()

  return useMutation({
    mutationFn: () => authApi.logout({ refresh_token: token || '' }),
    onSuccess: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login')
    },
    onError: (error) => {
      // Still clear auth even if logout fails
      clearAuth()
      queryClient.clear()
      navigate('/login')
      console.error('Logout error:', handleApiError(error))
    },
  })
}

export function useLogoutAll() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((state) => state.clearAuth)

  return useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: () => {
      clearAuth()
      queryClient.clear()
      navigate('/login')
    },
    onError: (error) => {
      clearAuth()
      queryClient.clear()
      navigate('/login')
      console.error('Logout all error:', handleApiError(error))
    },
  })
}

export function useProfile() {
  const { isAuthenticated } = useAuthStore()
  const setUser = useAuthStore((state) => state.setUser)

  const query = useQuery({
    queryKey: authKeys.profile(),
    queryFn: authApi.getProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  if (query.data) {
    setUser(query.data)
  }

  if (query.error) {
    console.error('Profile fetch error:', handleApiError(query.error))
  }

  return query
}

export function useChangePassword() {
  const navigate = useNavigate()
  const setRequiresPasswordChange = useAuthStore((state) => state.setRequiresPasswordChange)

  return useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      setRequiresPasswordChange(false)
      navigate('/dashboard')
    },
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: authApi.requestPasswordReset,
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useResetPassword() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      navigate('/login')
    },
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useGenerate2FA() {
  return useMutation({
    mutationFn: authApi.generate2FA,
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useEnable2FA() {
  return useMutation({
    mutationFn: authApi.enable2FA,
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useDisable2FA() {
  return useMutation({
    mutationFn: authApi.disable2FA,
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}

export function useRegenerateBackupCodes() {
  return useMutation({
    mutationFn: authApi.regenerateBackupCodes,
    onError: (error) => {
      throw new Error(handleApiError(error))
    },
  })
}
