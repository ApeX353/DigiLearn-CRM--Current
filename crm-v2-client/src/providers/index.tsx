import { type ReactNode } from 'react'
import { QueryProvider } from './query-provider'
import { RbacProvider } from './rbac-provider'
import { SettingsProvider } from '~/providers/settings-provider'
import { Toaster } from '~/components/ui/sonner'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <RbacProvider>
        <SettingsProvider>
          {children}
          {/* Sonner's <Toaster> was defined in components/ui/sonner
              but never mounted anywhere, so EVERY toast.*() call in the
              app — form feedback and real-time notification pushes
              alike — silently rendered nothing. Mounting it once at the
              root makes all of them visible. */}
          <Toaster position="top-right" richColors closeButton />
        </SettingsProvider>
      </RbacProvider>
    </QueryProvider>
  )
}
