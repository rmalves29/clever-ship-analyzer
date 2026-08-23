-- envio_messages.group_id e campaign_id passaram a referenciar fe_groups/fe_campaigns do
-- live-launchpad-79 (banco diferente, sem FK possível entre bancos) desde que Grupos/Campanhas
-- do Fluxo de Envio foram repontados pra lá. As FKs antigas pra envio_groups/envio_campaigns
-- locais (agora órfãs) bloqueariam qualquer insert novo, manual ou de rotina de IA.
alter table envio_messages drop constraint if exists envio_messages_group_id_fkey;
alter table envio_messages drop constraint if exists envio_messages_campaign_id_fkey;
