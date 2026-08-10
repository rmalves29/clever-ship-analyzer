INSERT INTO public.store_settings (shopify_store_domain, shopify_client_id, shopify_client_secret)
VALUES ('crm-test-loja.myshopify.com', 'f4764ec8186bc418807be51c26d8c59c', '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')
ON CONFLICT (shopify_store_domain) DO UPDATE 
SET shopify_client_id = EXCLUDED.shopify_client_id, 
    shopify_client_secret = EXCLUDED.shopify_client_secret;
