import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { toast } from "sonner";
import { useAuthStore } from "~/stores/use-auth-store";
import { recordRecentError } from "~/lib/diagnostics/recent-errors";
import { uiHeaders } from "~/lib/diagnostics/ui-trail";

/** The API's error body since the diagnostics layer (14 Oct 2026). */
interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string | string[];
  /** ERR-XXXXXX, present when the server recorded the failure. */
  reference?: string;
  requestId?: string;
}

/** The ERR- code on a failed response, if the server issued one. */
export const apiErrorReference = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const ref = (error.response?.data as ApiErrorBody | undefined)?.reference;
  return typeof ref === "string" && ref ? ref : undefined;
};

/** The request id, from the body or the exposed header. */
export const apiRequestId = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined;
  const fromBody = (error.response?.data as ApiErrorBody | undefined)?.requestId;
  const fromHeader = error.response?.headers?.["x-request-id"];
  const id = fromBody ?? (typeof fromHeader === "string" ? fromHeader : undefined);
  return typeof id === "string" && id ? id : undefined;
};

/** One toast per reference per minute: a retry loop must not stack toasts. */
const recentToasts = new Map<string, number>();
const toastOnce = (key: string, text: string) => {
  const now = Date.now();
  const last = recentToasts.get(key) ?? 0;
  if (now - last < 60_000) return;
  recentToasts.set(key, now);
  toast.error(text);
};

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
      // Where the user is and what they just pressed, so the server can
      // write "from the Activities page, New Task form" on the audit row
      // or the error this request produces. Labels only, never values.
      if (config.headers) {
        for (const [name, value] of Object.entries(uiHeaders())) config.headers[name] = value;
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

      // Every other failure leaves a breadcrumb the bug-report form and the
      // client-event reporter can read: method, path, status, and the
      // reference/request id the server issued. 401 was handled above.
      const status = error.response?.status ?? 0;
      const method = originalRequest?.method?.toUpperCase() ?? "GET";
      const reference = apiErrorReference(error);
      const requestId = apiRequestId(error);
      if (status !== 401) {
        recordRecentError({
          kind: "failed_request",
          message: `${method} ${requestUrl} → ${status || "no response"}${reference ? ` (${reference})` : ""}: ${handleApiError(error)}`.slice(0, 500),
          method,
          url: requestUrl,
          status,
          reference,
          requestId,
        });
      }

      if (status === 404) {
        // 404 on a read endpoint is often an optional widget source
        // (e.g. feature-gated reports, notification preferences before
        // first save). Keep it as a warn so the console stays signal-rich.
        console.warn(`[api] 404 Not Found: ${method} ${requestUrl}`);
      }

      // A server-side failure or no answer at all: tell the user once, with
      // the code support can look up. 4xx are the caller's to explain (they
      // know what the user was doing); apiErrorMessage appends the code.
      if (status >= 500 || status === 0) {
        const text =
          status === 0
            ? "The server did not answer. Check your connection and try again."
            : `Something went wrong on our side.${reference ? ` Quote reference ${reference} if you report it.` : ""}`;
        toastOnce(reference ?? `${status}:${requestUrl}`, text);
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
      message?: string | string[];
      error?: string | string[];
    }>;

    if (axiosError.response) {
      const message =
        axiosError.response.data?.message || axiosError.response.data?.error;

      if (Array.isArray(message)) {
        return message.join("; ");
      }

      if (typeof message === "string" && message.trim()) {
        return message;
      }

      return "An error occurred";
    }

    if (axiosError.request) {
      return "No response from server. Please check your connection.";
    }
  }

  return error instanceof Error
    ? error.message
    : "An unexpected error occurred";
};

/**
 * The server's own explanation of a refusal, or the caller's fallback when the
 * server did not send one.
 *
 * Reuses handleApiError so that the cases it already gets right stay right:
 * NestJS validation failures arrive as `message: string[]`, which rendered
 * straight into a toast reads as garbage. The difference is the fallback —
 * handleApiError returns its own generic wording, while a caller usually has a
 * more specific sentence for "the request failed for no stated reason".
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const message = handleApiError(error);
  const generic = ["An error occurred", "An unexpected error occurred"];
  const text = generic.includes(message) ? fallback : message;
  // The server's reference code travels with the message so every existing
  // toast that uses this helper (about 120 call sites) shows it unchanged.
  const reference = apiErrorReference(error);
  return reference && !text.includes(reference) ? `${text} (Reference ${reference})` : text;
};
