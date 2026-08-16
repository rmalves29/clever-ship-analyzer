-- Tabela de Segmentos Dinâmicos (regras)
CREATE TABLE public.crm_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    descricao TEXT,
    regras JSONB NOT NULL DEFAULT '{"operator": "AND", "filters": []}',
    criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_segments TO authenticated;
GRANT ALL ON public.crm_segments TO service_role;
ALTER TABLE public.crm_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON public.crm_segments FOR ALL TO authenticated USING (true);

-- Tabela de Listas Estáticas
CREATE TABLE public.crm_static_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    descricao TEXT,
    criado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_static_lists TO authenticated;
GRANT ALL ON public.crm_static_lists TO service_role;
ALTER TABLE public.crm_static_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON public.crm_static_lists FOR ALL TO authenticated USING (true);

-- Relação Membros da Lista (Clientes Shopify -> Lista)
CREATE TABLE public.crm_list_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lista_id UUID REFERENCES public.crm_static_lists(id) ON DELETE CASCADE NOT NULL,
    customer_id TEXT NOT NULL, -- ID da Shopify (gid://shopify/Customer/...)
    adicionado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(lista_id, customer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_list_members TO authenticated;
GRANT ALL ON public.crm_list_members TO service_role;
ALTER TABLE public.crm_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total para autenticados" ON public.crm_list_members FOR ALL TO authenticated USING (true);
