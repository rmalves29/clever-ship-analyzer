-- Situação "Inativa" das réguas de WhatsApp (além de Ativa e Pausada).
--   ativo = true                      -> Ativa (roda)
--   ativo = false, inativa = false    -> Pausada (desligada, pretende voltar)
--   ativo = false, inativa = true     -> Inativa (fora de uso, candidata a apagar)
-- O motor das automações só lê `ativo`; `inativa` é só organização na tela. Idempotente.
alter table crm.whatsapp_automations
  add column if not exists inativa boolean not null default false;

comment on column crm.whatsapp_automations.inativa is
  'Régua fora de uso (não roda e fica separada das pausadas). Só faz sentido com ativo = false.';
