-- Rode no hfm (Supabase MCP execute_sql, projeto letaopgwhwniovmwehfm) DEPOIS da carga e do 05_copy_storage.mjs.
-- 1) troca as URLs de arquivos do Storage antigo pelas do Storage novo.
-- 2) mostra o que ainda aponta pro banco antigo (deve voltar 0 linhas em tudo).
set search_path = crm, public;

update envio_messages set media_url = replace(media_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where media_url like '%hqlwujrbjacrvjwzsabo%';
update envio_auto_messages set media_url = replace(media_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where media_url like '%hqlwujrbjacrvjwzsabo%';
update ai_content_queue set content_image_url = replace(content_image_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where content_image_url like '%hqlwujrbjacrvjwzsabo%';
update ai_send_routines set content_image_url = replace(content_image_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where content_image_url like '%hqlwujrbjacrvjwzsabo%';
update site_gate_settings set image_url = replace(image_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where image_url like '%hqlwujrbjacrvjwzsabo%';
update site_gate_settings set group_url = replace(group_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where group_url like '%hqlwujrbjacrvjwzsabo%';
update popup_campaigns set image_url = replace(image_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where image_url like '%hqlwujrbjacrvjwzsabo%';
update wa_campaigns set header_media_url = replace(header_media_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where header_media_url like '%hqlwujrbjacrvjwzsabo%';
update whatsapp_message_queue set header_media_url = replace(header_media_url, 'https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public/', 'https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/') where header_media_url like '%hqlwujrbjacrvjwzsabo%';

-- verificação: quantas linhas ainda citam o banco antigo (mensagens recebidas do cliente, em whatsapp_inbox_messages, são histórico e ficam como estão)
select 'envio_messages' t, count(*) from envio_messages where media_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'envio_auto_messages', count(*) from envio_auto_messages where media_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'ai_content_queue', count(*) from ai_content_queue where content_image_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'ai_send_routines', count(*) from ai_send_routines where content_image_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'site_gate_settings', count(*) from site_gate_settings where image_url like '%hqlwujrbjacrvjwzsabo%' or group_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'popup_campaigns', count(*) from popup_campaigns where image_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'wa_campaigns', count(*) from wa_campaigns where header_media_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'whatsapp_message_queue', count(*) from whatsapp_message_queue where header_media_url like '%hqlwujrbjacrvjwzsabo%'
union all select 'whatsapp_inbox_messages (histórico)', count(*) from whatsapp_inbox_messages where media_url like '%hqlwujrbjacrvjwzsabo%';
