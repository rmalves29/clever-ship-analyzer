-- Domínio público de verdade da loja (o que o visitante vê no navegador), separado do
-- shopify_store_domain administrativo (*.myshopify.com, usado só pra autenticar na Admin API).
-- Sem isso, o CORS do pop-up (src/server.ts) rejeitava toda chamada vinda do site real da loja.
alter table store_settings add column if not exists storefront_domain text;
