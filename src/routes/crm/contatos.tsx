import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/contatos')({
  beforeLoad: () => {
    throw redirect({ to: '/crm', search: { tab: 'contatos' } })
  },
})
