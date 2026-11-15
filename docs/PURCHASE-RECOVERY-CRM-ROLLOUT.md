# Recuperação de compras no CRM atual

O CRM atual usa `letaopgwhwniovmwehfm`, schema `crm`, na Vercel (`crm.maniadmulher.com`, também acessível por `crm-push-mm.vercel.app`). O Lovable Cloud é legado e não deve ser usado para criar réguas operacionais.

Em 15/11/2026, a migração Supabase `purchase_recovery_crm_schema` instalou no schema `crm` a tabela de tentativas, índices, RLS e duas funções SQL invoker restritas a `service_role`. As migrações Drizzle 0003/0004 do Lovable usam `public`; elas não preparam esse banco compartilhado automaticamente. Não aplicar essas migrações no schema `public` do banco do CRM.

A automação foi pausada no legado antes da transferência. A régua, sua campanha inicial, 68 destinatários já enviados com os IDs originais da Meta e 76 tentativas foram copiados preservando IDs. Nenhum job de envio foi recriado. A exceção de horário foi encerrada. O lote inicial fica marcado como descoberto e não é redescoberto.

O host autorizado do agendamento passa a ser `crm.maniadmulher.com`. Os IDs das réguas PIX/carrinho bloqueadoras devem ser os do banco atual. Modelos, compras, respostas, opt-outs e janela de horário continuam sendo conferidos no tick e antes do envio.

Verificar o gate Meta e o processamento do tick no ambiente atual antes de considerar a transferência concluída. Confirmar que os 68 destinatários continuam enviados e que não existem jobs recriados para eles. Novas entradas e lembretes respeitam 09h–19h de Brasília.
