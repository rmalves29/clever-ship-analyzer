import {
  MessageCircle,
  Smartphone,
  Mail,
  Plus,
  Sparkles,
  Zap,
  GitBranch,
  Shuffle,
  Timer,
  PlayCircle,
  MessageSquare,
  Clock,
  Play,
} from "lucide-react";
import type { FlowNodeKind } from "@/lib/flow.server";

export interface StepMeta {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  headerBg: string;
  iconBg: string;
  iconColor: string;
  placeholderLabel: string;
  notesLabel: string;
  placeholderNotes: string;
}

export const STEP_META: Record<FlowNodeKind, StepMeta> = {
  trigger: {
    label: "Gatilho", icon: Play,
    headerBg: "linear-gradient(90deg,#ecfdf5,#d1fae5)",
    iconBg: "#10b981", iconColor: "#fff",
    placeholderLabel: "Novo gatilho", notesLabel: "Configuração",
    placeholderNotes: "",
  },
  message: {
    label: "Enviar Mensagem", icon: MessageSquare,
    headerBg: "linear-gradient(90deg,#faf5ff,#fce7f3)",
    iconBg: "linear-gradient(135deg,#a855f7,#ec4899,#f97316)", iconColor: "#fff",
    placeholderLabel: "Mensagem Instagram", notesLabel: "Conteúdo",
    placeholderNotes: "",
  },
  messenger: {
    label: "Messenger", icon: MessageCircle,
    headerBg: "linear-gradient(90deg,#eff6ff,#dbeafe)",
    iconBg: "#2563eb", iconColor: "#fff",
    placeholderLabel: "Mensagem Messenger", notesLabel: "Texto da mensagem",
    placeholderNotes: "Escreva a mensagem que será enviada no Messenger…",
  },
  sms: {
    label: "SMS", icon: Smartphone,
    headerBg: "linear-gradient(90deg,#ecfdf5,#d1fae5)",
    iconBg: "#059669", iconColor: "#fff",
    placeholderLabel: "SMS", notesLabel: "Texto do SMS",
    placeholderNotes: "Mensagem curta (máx. 160 caracteres)…",
  },
  email: {
    label: "E-mail", icon: Mail,
    headerBg: "linear-gradient(90deg,#f5f3ff,#ede9fe)",
    iconBg: "#7c3aed", iconColor: "#fff",
    placeholderLabel: "E-mail", notesLabel: "Assunto e corpo",
    placeholderNotes: "Assunto: ...\n\nCorpo do e-mail…",
  },
  channel: {
    label: "Canal", icon: Plus,
    headerBg: "linear-gradient(90deg,#f9fafb,#f3f4f6)",
    iconBg: "#6b7280", iconColor: "#fff",
    placeholderLabel: "Canal customizado", notesLabel: "Configuração",
    placeholderNotes: "Descreva o canal…",
  },
  ai_step: {
    label: "Etapa de IA", icon: Sparkles,
    headerBg: "linear-gradient(90deg,#f1f5f9,#e2e8f0)",
    iconBg: "#0f172a", iconColor: "#fff",
    placeholderLabel: "Etapa de IA", notesLabel: "Prompt / Instrução",
    placeholderNotes: "Instrua a IA sobre como responder ou classificar…",
  },
  action: {
    label: "Ação", icon: Zap,
    headerBg: "linear-gradient(90deg,#fef9c3,#fef08a)",
    iconBg: "#eab308", iconColor: "#fff",
    placeholderLabel: "Ação", notesLabel: "O que fazer",
    placeholderNotes: "Ex.: adicionar tag \"lead-quente\", atribuir a…",
  },
  condition: {
    label: "Condição", icon: GitBranch,
    headerBg: "linear-gradient(90deg,#fff7ed,#ffedd5)",
    iconBg: "#f97316", iconColor: "#fff",
    placeholderLabel: "Condição", notesLabel: "Regra (SE / SENÃO)",
    placeholderNotes: "Ex.: SE mensagem contém \"preço\" ENTÃO…",
  },
  randomizer: {
    label: "Randomizador", icon: Shuffle,
    headerBg: "linear-gradient(90deg,#fdf2f8,#fce7f3)",
    iconBg: "#db2777", iconColor: "#fff",
    placeholderLabel: "A / B", notesLabel: "Distribuição",
    placeholderNotes: "Ex.: 50% → caminho A, 50% → caminho B",
  },
  smart_delay: {
    label: "Atraso Inteligente", icon: Timer,
    headerBg: "linear-gradient(90deg,#fff7ed,#fed7aa)",
    iconBg: "#ea580c", iconColor: "#fff",
    placeholderLabel: "Atraso inteligente", notesLabel: "Regra de espera",
    placeholderNotes: "Ex.: aguardar 2h ou até o usuário responder",
  },
  start_automation: {
    label: "Iniciar Automação", icon: PlayCircle,
    headerBg: "linear-gradient(90deg,#ecfeff,#cffafe)",
    iconBg: "#0891b2", iconColor: "#fff",
    placeholderLabel: "Chamar outra automação", notesLabel: "Automação a iniciar",
    placeholderNotes: "Nome ou ID da automação a disparar…",
  },
  delay: {
    label: "Atraso", icon: Clock,
    headerBg: "linear-gradient(90deg,#fff7ed,#fed7aa)",
    iconBg: "#ea580c", iconColor: "#fff",
    placeholderLabel: "Atraso", notesLabel: "Minutos",
    placeholderNotes: "",
  },
};

export const CONTENT_KINDS: FlowNodeKind[] = ["message", "messenger", "sms", "email", "channel"];
export const LOGIC_KINDS: FlowNodeKind[] = [
  "ai_step", "action", "condition", "randomizer", "smart_delay", "start_automation",
];
