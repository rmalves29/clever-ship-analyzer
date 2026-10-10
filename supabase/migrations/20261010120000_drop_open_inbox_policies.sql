-- Segurança: estas políticas liberavam leitura e escrita da caixa de entrada do WhatsApp (telefones e mensagens
-- de clientes) para QUALQUER usuário autenticado do projeto. O CRM só acessa estas tabelas pelo servidor
-- (chave de serviço, que ignora RLS), então não precisam de política para authenticated.
drop policy if exists "Authenticated users manage inbox threads" on public.whatsapp_inbox_threads;
drop policy if exists "Authenticated users manage inbox messages" on public.whatsapp_inbox_messages;
