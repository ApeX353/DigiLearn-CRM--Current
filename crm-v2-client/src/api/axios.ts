import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { useAuthStore } from "~/stores/use-auth-store";

const API_BASE_URL =
  import.meta.env.VITE_PUBLIC_API_URL as string;

// Token management
let accessToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });

  failedQueue = [];
};

export const setTokens = (access: string) => {
  accessToken = access;
};

export const clearTokens = () => {
  accessToken = null;
};

export const getAccessToken = () => {
  return useAuthStore.getState().token || accessToken;
};

// Base axios instance without auth
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable cookies
});

// Axios instance with authentication
export const apiClientAuth: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable cookies
});

// Request interceptor for auth instance - add JWT token

// Request interceptor for the apiClientAuth
const setupRequestInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      const token = getAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );
};

// Response interceptor for both instances - handle errors and refresh token
const setupResponseInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & {
        _retry?: boolean;
      };
      const requestUrl = originalRequest?.url || "";
      const isRefreshEndpoint = requestUrl.includes("/auth/refresh");
      const skipRefresh =
        originalRequest?.headers?.["x-skip-auth-refresh"] === "true";

      // Handle 401 errors - token expired or invalid
      if (
        error.response?.status === 401 &&
        !!originalRequest &&
        !originalRequest._retry &&
        !isRefreshEndpoint &&
        !skipRefresh
      ) {
        if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          })
            .then(() => {
              const token = useAuthStore.getState().token || getAccessToken();
              if (token && originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return instance(originalRequest);
            })
            .catch((err) => {
              return Promise.reject(err);
            });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          // Try to refresh the token via secure cookie
          const response = await apiClient.get("/auth/refresh", {
            headers: {
              "x-skip-auth-refresh": "true",
            },
          });

          const access_token = response.data?.access_token as string | undefined;
          const user = response.data?.user as
            | { id: string; email: string; first_name: string; last_name: string; roles: string[]; avatar_url?: string }
            | undefined;

          if (!access_token) {
            throw new Error("No access token returned during refresh");
          }

          setTokens(access_token);
          useAuthStore.setState((state) => ({
            token: access_token,
            user: user
              ? {
                  id: user.id,
                  email: user.email,
                  first_name: user.first_name,
                  last_name: user.last_name,
                  roles: user.roles,
                  avatar_url: user.avatar_url || "",
                }
              : state.user,
            isLoggedIn: true,
            isAuthenticated: true,
          }));

          // Update the authorization header
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${access_token}`;
          }

          processQueue(null);
          isRefreshing = false;

          return instance(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as Error);
          clearTokens();
          useAuthStore.getState().clearAuth();
          isRefreshing = false;
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          return Promise.reject(refreshError);
        }
      }

      // Handle other errors
      if (error.response?.status === 403) {
        console.error("Access forbidden - insufficient permissions");
      }

      if (error.response?.status === 404) {
        console.error("Resource not found");
      }

      if (error.response?.status === 500) {
        console.error("Server error - please try again later");
      }

      return Promise.reject(error);
    }
  );
};

// Setup interceptors for both instances
setupRequestInterceptor(apiClientAuth);
setupResponseInterceptor(apiClientAuth);

// Error handler helper
export const handleApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
    }>;

    if (axiosError.response) {
      return (
        axiosError.response.data?.message ||
        axiosError.response.data?.error ||
        "An error occurred"
      );
    }

    if (axiosError.request) {
      return "No response from server. Please check your connection.";
    }
  }

  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
};
