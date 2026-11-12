import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiErrorMessage } from "~/api/axios";

/**
 * useMutation with the failure path filled in. Until 14 Oct 2026, 49 mutation
 * hooks ended in `onError: (e) => console.error(...)`: the server's explanation
 * (and now its reference code) was extracted and thrown away where the user
 * could not see it. This wrapper shows it as a toast, with the caller's
 * sentence as the fallback, and still lets a caller add its own onError.
 */
export function useAppMutation<TData = unknown, TError = unknown, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext> & {
    /** Shown when the server sent no usable message. */
    errorMessage?: string;
    successMessage?: string;
  },
) {
  const { errorMessage, successMessage, onError, onSuccess, ...rest } = options;
  return useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    onSuccess: (data, variables, context, mutation) => {
      if (successMessage) toast.success(successMessage);
      return onSuccess?.(data, variables, context, mutation);
    },
    onError: (error, variables, context, mutation) => {
      toast.error(apiErrorMessage(error, errorMessage ?? "That did not work. Please try again."));
      return onError?.(error, variables, context, mutation);
    },
  });
}
