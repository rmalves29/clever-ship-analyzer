import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/listas-estaticas')({
  beforeLoad: () => {
    throw redirect({ to: '/crm', search: { tab: 'listas' } })
  },
})
