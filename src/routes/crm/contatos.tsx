import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/contatos')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/crm/contatos"!</div>
}
