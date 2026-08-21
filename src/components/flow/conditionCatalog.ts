import {
  Tag,
  MousePointerClick,
  Megaphone,
  Plug,
  ListChecks,
  MessageCircle,
  Repeat,
  Clock,
  PieChart,
  Type,
  User,
  Mail,
  Phone,
  UserCheck,
  Hash,
  MessageSquare,
  Camera,
  Eye,
  Users,
  ToggleLeft,
  BadgeCheck,
  Headset,
  Globe,
  Languages,
  Timer,
  Smartphone,
  Flag,
  MapPin,
  ShoppingCart,
  Package,
  Gift,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

export type ConditionCategory = "recommended" | "general" | "system" | "custom";

export type ConditionFieldType = "text" | "number" | "boolean" | "select";

export interface ConditionField {
  key: string;
  label: string;
  type: ConditionFieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface ConditionDef {
  id: string;
  category: ConditionCategory;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconColor?: string;
  group?: string;
  fields: ConditionField[];
}

export const CONDITION_CATEGORIES: {
  id: ConditionCategory;
  label: string;
  description: string;
}[] = [
  { id: "recommended", label: "Recomendados", description: "Filtros mais usados" },
  { id: "general", label: "Filtros Gerais", description: "Segmentações comuns" },
  { id: "system", label: "Campos do Sistema", description: "Dados nativos do contato" },
  { id: "custom", label: "Campos Personalizados do Usuário", description: "Campos criados por você" },
];

const OP_TEXT: ConditionField = {
  key: "operator",
  label: "Operador",
  type: "select",
  options: [
    { value: "equals", label: "é igual a" },
    { value: "not_equals", label: "é diferente de" },
    { value: "contains", label: "contém" },
    { value: "not_contains", label: "não contém" },
    { value: "starts_with", label: "começa com" },
    { value: "ends_with", label: "termina com" },
    { value: "exists", label: "está preenchido" },
    { value: "not_exists", label: "está vazio" },
  ],
};

const OP_NUM: ConditionField = {
  key: "operator",
  label: "Operador",
  type: "select",
  options: [
    { value: "equals", label: "=" },
    { value: "not_equals", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
  ],
};

const OP_BOOL: ConditionField = {
  key: "operator",
  label: "Estado",
  type: "select",
  options: [
    { value: "is_true", label: "é verdadeiro" },
    { value: "is_false", label: "é falso" },
  ],
};

const OP_DATE: ConditionField = {
  key: "operator",
  label: "Operador",
  type: "select",
  options: [
    { value: "within_last", label: "nas últimas (horas)" },
    { value: "before", label: "antes de (dias)" },
    { value: "after", label: "após (dias)" },
  ],
};

const textCondition = (
  id: string,
  category: ConditionCategory,
  label: string,
  icon: LucideIcon,
  extras: Partial<ConditionDef> = {},
): ConditionDef => ({
  id,
  category,
  label,
  icon,
  iconColor: "#6b7280",
  fields: [OP_TEXT, { key: "value", label: "Valor", type: "text", placeholder: "Digite o valor" }],
  ...extras,
});

const boolCondition = (
  id: string,
  category: ConditionCategory,
  label: string,
  icon: LucideIcon,
  extras: Partial<ConditionDef> = {},
): ConditionDef => ({
  id,
  category,
  label,
  icon,
  iconColor: "#6b7280",
  fields: [OP_BOOL],
  ...extras,
});

const numCondition = (
  id: string,
  category: ConditionCategory,
  label: string,
  icon: LucideIcon,
  extras: Partial<ConditionDef> = {},
): ConditionDef => ({
  id,
  category,
  label,
  icon,
  iconColor: "#6b7280",
  fields: [OP_NUM, { key: "value", label: "Valor", type: "number", placeholder: "0" }],
  ...extras,
});

const dateCondition = (
  id: string,
  category: ConditionCategory,
  label: string,
  icon: LucideIcon,
  extras: Partial<ConditionDef> = {},
): ConditionDef => ({
  id,
  category,
  label,
  icon,
  iconColor: "#6b7280",
  fields: [OP_DATE, { key: "value", label: "Quantidade", type: "number", placeholder: "24" }],
  ...extras,
});

export const CONDITION_CATALOG: ConditionDef[] = [
  {
    id: "has_tag",
    category: "recommended",
    label: "Tag",
    description: "O contato possui uma tag específica",
    icon: Tag,
    iconColor: "#10b981",
    fields: [
      {
        key: "operator",
        label: "Condição",
        type: "select",
        options: [
          { value: "has", label: "tem a tag" },
          { value: "has_not", label: "não tem a tag" },
        ],
      },
      { key: "value", label: "Tag", type: "text", placeholder: "lead-quente" },
    ],
  },
  textCondition("last_message", "recommended", "Última mensagem recebida", MessageCircle, {
    description: "Filtra pelo conteúdo da última mensagem do contato",
  }),
  boolCondition("subscribed", "recommended", "Está inscrito", ListChecks, {
    description: "O contato está inscrito no bot",
  }),
  {
    id: "opted_in_widget",
    category: "general",
    label: "Opted-in Através do Widget",
    icon: MousePointerClick,
    iconColor: "#6b7280",
    fields: [OP_BOOL],
  },
  {
    id: "opted_via_ad",
    category: "general",
    label: "Optou pelo Anúncio",
    icon: Megaphone,
    iconColor: "#6b7280",
    fields: [OP_BOOL],
  },
  {
    id: "opted_in_api",
    category: "general",
    label: "Optou-In através da API",
    icon: Plug,
    iconColor: "#6b7280",
    fields: [OP_BOOL],
  },
  textCondition("list_available", "general", "Lista de inscritos já disponível", ListChecks),
  textCondition("messenger_subscribed_list", "general", "Messenger: Subscribed to List", MessageCircle),
  textCondition("signature_sequence", "general", "Sequência de assinatura", Repeat),
  dateCondition("current_time", "general", "Hora atual", Clock, {
    description: "Filtra pelo horário atual",
  }),
  textCondition("segment", "general", "Segmento", PieChart),
  textCondition("first_name", "system", "Primeiro Nome", Type),
  textCondition("last_name", "system", "Sobrenome", Type),
  textCondition("full_name", "system", "Nome Completo", User),
  textCondition("email", "system", "E-mail", Mail),
  textCondition("phone", "system", "Celular", Phone),
  boolCondition("is_subscribed", "system", "Inscrito", UserCheck),
  textCondition("contact_id", "system", "ID do contato", Hash),
  textCondition("last_reply_type", "system", "Last Reply Type", MessageSquare),
  dateCondition("ig_last_interaction", "system", "Última interação", Clock, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  dateCondition("ig_last_seen", "system", "Visto por último", Eye, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  textCondition("ig_window", "system", "Segmento de janela de mensagens", MessageCircle, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  numCondition("ig_followers", "system", "Número de seguidores", Users, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  textCondition("ig_username", "system", "Usuário", User, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  boolCondition("ig_authorized", "system", "Autorizou", ToggleLeft, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  boolCondition("ig_is_following", "system", "Está seguindo sua conta", UserCheck, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  boolCondition("ig_verified", "system", "Verificado", BadgeCheck, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  boolCondition("ig_sales_contact", "system", "A equipe comercial fará o contato", Headset, {
    group: "Instagram",
    iconColor: "#ec4899",
  }),
  textCondition("fb_language", "system", "Idioma", Languages, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  textCondition("fb_timezone", "system", "Fuso horário", Globe, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  dateCondition("fb_last_interaction", "system", "Última interação", Clock, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  dateCondition("fb_last_seen", "system", "Visto por último", Eye, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  textCondition("fb_window", "system", "Segmento de janela de mensagens", MessageCircle, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  textCondition("fb_gender", "system", "Gênero", User, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  boolCondition("fb_authorized", "system", "Autorizou", ToggleLeft, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  boolCondition("fb_eea_affected", "system", "EEA Afetado", Globe, {
    group: "Facebook",
    iconColor: "#2563eb",
  }),
  textCondition("sms_country_code", "system", "Código do país", Flag, {
    group: "SMS",
    iconColor: "#10b981",
  }),
  textCondition("sms_us_state", "system", "Estado dos E.U.A. (baseado no telefone)", MapPin, {
    group: "SMS",
    iconColor: "#10b981",
  }),
  boolCondition("sms_authorized", "system", "Autorizou", Smartphone, {
    group: "SMS",
    iconColor: "#10b981",
  }),
  boolCondition("email_authorized", "system", "Autorizou", Mail, {
    group: "Email",
    iconColor: "#7c3aed",
  }),
  numCondition("cart_total_formatted", "custom", "cart_total_formatted", ShoppingCart, {
    iconColor: "#6b7280",
  }),
  textCondition("contact_details", "custom", "contact_details", User),
  textCondition("gift_type", "custom", "gift_type", Gift),
  textCondition("gift_type_details", "custom", "gift_type_details", Gift),
  textCondition("mensagem", "custom", "Mensagem", MessageSquare),
  boolCondition("product_found", "custom", "product_found", Package),
  textCondition("product_name", "custom", "product_name", Package),
  numCondition("product_price_formatted", "custom", "product_price_formatted", DollarSign),
  numCondition("quantity", "custom", "quantity", Hash),
  numCondition("total_price", "custom", "total_price", DollarSign),
  textCondition("timer_answered", "custom", "timer_answered", Timer),
  textCondition("instagram_ref", "custom", "instagram_ref", Camera, { iconColor: "#ec4899" }),
];

export function getCondition(id?: string): ConditionDef | undefined {
  if (!id) return undefined;
  return CONDITION_CATALOG.find((c) => c.id === id);
}
