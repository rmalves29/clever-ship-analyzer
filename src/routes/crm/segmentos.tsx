import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/crm/segmentos')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/crm/segmentos"!</div>
}
