import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/segmentos')({
  beforeLoad: () => {
    throw redirect({ to: '/crm', search: { tab: 'segmentos' } })
  },
})
