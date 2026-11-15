# Rollout: coluna `inativa` em `public.whatsapp_automations`

- **Problema encontrado (15/11/2026):** a migration antiga `supabase/migrations/20261111190000_automation_inativa.sql` cria a coluna em `crm.whatsapp_automations`, mas este CRM roda no schema `public`. Em `public` a coluna não existia, e a conferência do worker da recuperação de compras (que lê `inativa`) falhava com erro 42703.
- **Correção no banco atual:** aplicada manualmente pelo proprietário (`ADD COLUMN IF NOT EXISTS`, NOT NULL DEFAULT false, com comentário).
- **Registro para bancos novos:** `drizzle/migrations/0005_whatsapp_automations_inativa_public.sql` (idempotente; no banco atual não alterou nada). A migration antiga do schema `crm` foi mantida como está.
- **Conferência após deploy:** `select inativa from public.whatsapp_automations limit 1` deve funcionar; o fluxo de recuperação deve estar com `ativo = true` e `inativa = false`.
