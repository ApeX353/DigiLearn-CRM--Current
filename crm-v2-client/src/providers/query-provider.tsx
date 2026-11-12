import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage } from '~/api/axios'

interface QueryProviderProps {
  children: ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        // Safety net for the failure path. Until 14 Oct 2026 forty-nine
        // mutation hooks ended in console.error, so a refused save produced
        // no visible message at all. A mutation that declares its own
        // onError keeps control; one that does not gets the server's
        // explanation (and reference code) as a toast.
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.options.onError) return
            toast.error(apiErrorMessage(error, 'That did not work. Please try again.'))
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
