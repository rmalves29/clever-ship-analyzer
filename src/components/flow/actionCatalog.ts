import {
  Tag,
  Tags,
  Save,
  Eraser,
  Trash2,
  Camera,
  BellOff,
  Database,
  ListPlus,
  ListX,
  Cloud,
  Menu,
  BarChart3,
  Users,
  Pause,
  Inbox,
  CheckCircle2,
  UserPlus,
  Bell,
  type LucideIcon,
} from "lucide-react";

export type ActionFieldType = "text" | "textarea" | "number" | "select" | "boolean";

export interface ActionField {
  key: string;
  label: string;
  type: ActionFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

export interface ActionDef {
  id: string;
  category: ActionCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor?: string;
  fields: ActionField[];
}

export type ActionCategory = "contact" | "automation" | "inbox";

export const ACTION_CATEGORIES: { id: ActionCategory; label: string; description: string }[] = [
  { id: "contact", label: "Dados do contato", description: "Gerencie tags e campos do contato" },
  { id: "automation", label: "Automação", description: "Gerenciar fluxo de automação" },
  { id: "inbox", label: "Caixa de Entrada", description: "Gerenciar comportamento da caixa de entrada" },
];

export const ACTION_CATALOG: ActionDef[] = [
  {
    id: "add_tag",
    category: "contact",
    label: "Adicionar Tag",
    description: "Rotule seus contatos para facilitar a organização e segmentação",
    icon: Tag,
    iconColor: "#6b7280",
    fields: [{ key: "tag", label: "Tag", type: "text", placeholder: "lead-quente", required: true }],
  },
  {
    id: "remove_tag",
    category: "contact",
    label: "Remover Tag",
    description: "Remova tags atribuídas quando não forem mais necessárias",
    icon: Tags,
    iconColor: "#6b7280",
    fields: [{ key: "tag", label: "Tag", type: "text", placeholder: "lead-quente", required: true }],
  },
  {
    id: "set_user_field",
    category: "contact",
    label: "Definir campo do usuário",
    description: "Gerencie dados do cliente (data de nascimento, itens na loja, etc.)",
    icon: Save,
    iconColor: "#6b7280",
    fields: [
      { key: "field", label: "Campo", type: "text", placeholder: "nome_completo", required: true },
      { key: "value", label: "Valor", type: "text", placeholder: "{{first_name}}" },
    ],
  },
  {
    id: "clear_user_field",
    category: "contact",
    label: "Limpar campo personalizado",
    description: "Excluir dados armazenados no campo",
    icon: Eraser,
    iconColor: "#6b7280",
    fields: [{ key: "field", label: "Campo", type: "text", placeholder: "nome_do_campo", required: true }],
  },
  {
    id: "delete_contact",
    category: "contact",
    label: "Excluir contato",
    description: "Excluir contato permanentemente de forma automática",
    icon: Trash2,
    iconColor: "#ef4444",
    fields: [{ key: "confirm", label: "Confirmar exclusão", type: "boolean" }],
  },
  {
    id: "ig_opt_in",
    category: "contact",
    label: "Configurar o consentimento no Instagram",
    description: "Seguidores com consentimento podem receber mensagens diretas",
    icon: Camera,
    iconColor: "#ec4899",
    fields: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "opt_in", label: "Aceitar" },
          { value: "opt_out", label: "Recusar" },
        ],
        required: true,
      },
    ],
  },
  {
    id: "ig_opt_out",
    category: "contact",
    label: "Cancelar recebimento de DMs no Instagram",
    description: "Quando o usuário opta por não receber, DMs automáticas não serão enviadas",
    icon: BellOff,
    iconColor: "#ec4899",
    fields: [],
  },
  {
    id: "set_bot_field",
    category: "automation",
    label: "Definir campo do Bot",
    description: "Gerencie dados sobre seu negócio (quantidades, produtos)",
    icon: Database,
    iconColor: "#6b7280",
    fields: [
      { key: "field", label: "Campo", type: "text", placeholder: "estoque_atual", required: true },
      { key: "value", label: "Valor", type: "text", placeholder: "42" },
    ],
  },
  {
    id: "subscribe_sequence",
    category: "automation",
    label: "Inscrever-se na Sequência",
    description: "Inclua contatos em uma sequência de mensagens programadas",
    icon: ListPlus,
    iconColor: "#6b7280",
    fields: [{ key: "sequence", label: "Sequência", type: "text", placeholder: "Nome da sequência", required: true }],
  },
  {
    id: "unsubscribe_sequence",
    category: "automation",
    label: "Cancelar inscrição da Sequência",
    description: "Retire contatos de uma sequência de mensagens programadas",
    icon: ListX,
    iconColor: "#6b7280",
    fields: [{ key: "sequence", label: "Sequência", type: "text", placeholder: "Nome da sequência", required: true }],
  },
  {
    id: "external_request",
    category: "automation",
    label: "Fazer uma consulta externa",
    description: "Envie uma requisição HTTP para seu servidor",
    icon: Cloud,
    iconColor: "#6b7280",
    fields: [
      {
        key: "method",
        label: "Método",
        type: "select",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
          { value: "PUT", label: "PUT" },
          { value: "DELETE", label: "DELETE" },
        ],
        required: true,
      },
      { key: "url", label: "URL", type: "text", placeholder: "https://api.exemplo.com/hook", required: true },
      { key: "body", label: "Body (JSON)", type: "textarea", placeholder: '{"user":"{{id}}"}' },
    ],
  },
  {
    id: "change_messenger_menu",
    category: "automation",
    label: "Alterar Menu no Messenger",
    description: "Mudar para outro Menu Principal no Messenger",
    icon: Menu,
    iconColor: "#6b7280",
    fields: [{ key: "menu", label: "Menu", type: "text", placeholder: "Nome do menu", required: true }],
  },
  {
    id: "conversion_event",
    category: "automation",
    label: "Evento de conversão de registros",
    description: "Acompanhe seus lucros utilizando eventos de conversão",
    icon: BarChart3,
    iconColor: "#6b7280",
    fields: [
      { key: "event", label: "Evento", type: "text", placeholder: "purchase", required: true },
      { key: "value", label: "Valor (R$)", type: "number", placeholder: "0" },
    ],
  },
  {
    id: "update_ig_audience",
    category: "automation",
    label: "Atualizar público personalizado do Instagram",
    description: "Adicione ou remova contatos do seu público personalizado",
    icon: Users,
    iconColor: "#ec4899",
    fields: [
      { key: "audience", label: "Público", type: "text", placeholder: "Nome do público", required: true },
      {
        key: "operation",
        label: "Operação",
        type: "select",
        options: [
          { value: "add", label: "Adicionar" },
          { value: "remove", label: "Remover" },
        ],
        required: true,
      },
    ],
  },
  {
    id: "pause_automations",
    category: "automation",
    label: "Pausar todas as automações",
    description: "Suspender mensagens para alguns contatos pelo tempo necessário",
    icon: Pause,
    iconColor: "#6b7280",
    fields: [{ key: "minutes", label: "Duração (minutos)", type: "number", placeholder: "60" }],
  },
  {
    id: "mark_open",
    category: "inbox",
    label: "Marcar Conversa como Aberta",
    description: "Indica que a interação está em andamento",
    icon: Inbox,
    iconColor: "#6b7280",
    fields: [],
  },
  {
    id: "mark_closed",
    category: "inbox",
    label: "Marcar conversa como fechada",
    description: "Indica que a interação foi concluída",
    icon: CheckCircle2,
    iconColor: "#10b981",
    fields: [],
  },
  {
    id: "assign_conversation",
    category: "inbox",
    label: "Atribuir Conversa",
    description: "Atribuir conversa a um membro da equipe",
    icon: UserPlus,
    iconColor: "#6b7280",
    fields: [{ key: "assignee", label: "Responsável", type: "text", placeholder: "E-mail ou nome", required: true }],
  },
  {
    id: "notify_admins",
    category: "inbox",
    label: "Notificar responsáveis",
    description: "Notifique membros da equipe quando houver novas mensagens ou eventos",
    icon: Bell,
    iconColor: "#f59e0b",
    fields: [{ key: "message", label: "Mensagem", type: "textarea", placeholder: "Novo lead precisa de atenção" }],
  },
];

export function getAction(id?: string): ActionDef | undefined {
  if (!id) return undefined;
  return ACTION_CATALOG.find((a) => a.id === id);
}
