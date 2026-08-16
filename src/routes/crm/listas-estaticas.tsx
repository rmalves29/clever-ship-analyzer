import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/listas-estaticas')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/crm/listas-estaticas"!</div>
}
