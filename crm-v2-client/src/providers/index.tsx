import { type ReactNode } from 'react'
import { QueryProvider } from './query-provider'
import { RbacProvider } from './rbac-provider'
import { SettingsProvider } from './settings-provider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <RbacProvider>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </RbacProvider>
    </QueryProvider>
  )
}
