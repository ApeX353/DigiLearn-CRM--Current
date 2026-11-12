import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiClient, clearTokens, setTokens } from "~/api/axios";

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  avatar_url: string;
}

export interface AuthState {
  // State
  token: string | null;
  user: User | null;
  isLoggedIn: boolean;
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  requiresPasswordChange: boolean;

  // Actions
  setAuth: (
    token: string,
    user: User,
    requiresPasswordChange?: boolean
  ) => void;
  setUser: (user: User) => void;
  clearAuth: () => void;
  checkAuth: () => Promise<void>;
  setRequiresPasswordChange: (requires: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      token: null,
      user: null,
      isLoggedIn: false,
      isAuthenticated: false,
      isAuthChecking: true,
      requiresPasswordChange: false,

      // Set authentication with access token in-memory only
      setAuth: (token, user, requiresPasswordChange = false) => {
        setTokens(token);
        set({
          token,
          user,
          isLoggedIn: true,
          isAuthenticated: true,
          isAuthChecking: false,
          requiresPasswordChange,
        });
      },

      // Update user info
      setUser: (user) => {
        set({ user });
      },

      // Clear authentication
      clearAuth: () => {
        clearTokens();
        set({
          token: null,
          user: null,
          isLoggedIn: false,
          isAuthenticated: false,
          isAuthChecking: false,
          requiresPasswordChange: false,
        });
      },

      // Bootstrap auth from refresh cookie on app load
      checkAuth: async () => {
        set({ isAuthChecking: true });

        const token = get().token;
        if (token) {
          setTokens(token);
          set({
            token,
            isAuthenticated: true,
            isLoggedIn: true,
            isAuthChecking: false,
          });
          return;
        }

        try {
          const response = await apiClient.get("/auth/refresh", {
            headers: {
              "x-skip-auth-refresh": "true",
            },
          });

          const accessToken = response?.data?.access_token as
            | string
            | undefined;
          const refreshedUser = response?.data?.user as User | undefined;

          if (!accessToken) {
            throw new Error("No access token returned during refresh");
          }

          setTokens(accessToken);
          set({
            token: accessToken,
            user: refreshedUser ?? get().user,
            isLoggedIn: true,
            isAuthenticated: true,
            isAuthChecking: false,
          });
        } catch {
          clearTokens();
          set({
            token: null,
            user: null,
            isLoggedIn: false,
            isAuthenticated: false,
            isAuthChecking: false,
            requiresPasswordChange: false,
          });
        }
      },

      // Set password change requirement
      setRequiresPasswordChange: (requires) => {
        set({ requiresPasswordChange: requires });
      },
    }),
    {
      name: "auth-storage",
      // Persist only non-sensitive user metadata
      partialize: (state) => ({
        user: state.user,
        requiresPasswordChange: state.requiresPasswordChange,
      }),
    }
  )
);
