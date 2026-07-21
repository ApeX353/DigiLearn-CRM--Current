import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { AxiosError } from "axios";

interface ErrorMessageProps {
  error: Error | AxiosError | string | null;
  showIcon?: boolean;
  title?: string;
  className?: string;
}

/**
 * Extracts a user-friendly error message from various error types
 */
function getErrorMessage(error: Error | AxiosError | string): string {
  if (typeof error === "string") {
    return error;
  }

  // Handle AxiosError
  if ("isAxiosError" in error && error.isAxiosError) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
    }>;

    // Try to get message from response data
    if (axiosError.response?.data) {
      if (typeof axiosError.response.data === "string") {
        return axiosError.response.data;
      }
      if (axiosError.response.data.message) {
        return axiosError.response.data.message;
      }
      if (axiosError.response.data.error) {
        return axiosError.response.data.error;
      }
    }

    // Fallback to status text or generic message
    if (axiosError.response?.statusText) {
      return axiosError.response.statusText;
    }

    // Network errors
    if (axiosError.message === "Network Error") {
      return "Unable to connect to the server. Please check your internet connection.";
    }

    return axiosError.message || "An unexpected error occurred";
  }

  // Handle standard Error
  return error.message || "An unexpected error occurred";
}

export function ErrorMessage({
  error,
  showIcon = true,
  title = "Error",
  className,
}: ErrorMessageProps) {
  const errorMessage = error && getErrorMessage(error);

  if (!error) {
    return null;
  }

  return (
    <Alert variant="destructive" className={className}>
      {showIcon && <AlertCircle className="h-4 w-4" />}
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}
