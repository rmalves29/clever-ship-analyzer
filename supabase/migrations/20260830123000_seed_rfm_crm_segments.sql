-- Cria um segmento CRM dinâmico para cada classificação da matriz RFM.
-- A audiência não é materializada: as regras usam o rfm_segment atual do cliente.
-- A migração é idempotente por nome para preservar IDs já usados por campanhas e automações.

WITH definitions(segmento, slug, nome, descricao) AS (
  VALUES
    ('Sem compra', 'sem-compra', 'RFM — Sem compra', 'Segmento RFM dinâmico. Lead sem pedido pago. Permanece identificado fora da matriz dos compradores. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Campeões', 'campeoes', 'RFM — Campeões', 'Segmento RFM dinâmico. Compraram recentemente, têm alta frequência e estão entre os clientes de maior valor. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Leais', 'leais', 'RFM — Leais', 'Segmento RFM dinâmico. Compram com frequência e mantêm relacionamento recente com a loja. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Potencialmente Leais', 'potencialmente-leais', 'RFM — Potencialmente Leais', 'Segmento RFM dinâmico. Já fizeram a segunda compra recentemente e têm potencial para se tornar leais. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Novos', 'novos', 'RFM — Novos', 'Segmento RFM dinâmico. Fizeram a primeira compra dentro da janela recente de até 8 dias. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Precisa de atenção', 'precisa-atencao', 'RFM — Precisa de atenção', 'Segmento RFM dinâmico. Estão entre 9 e 15 dias sem comprar e ultrapassando o ciclo normal de recompra. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Quase hibernando', 'quase-hibernando', 'RFM — Quase hibernando', 'Segmento RFM dinâmico. Baixa frequência e entre 16 e 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Em risco', 'em-risco', 'RFM — Em risco', 'Segmento RFM dinâmico. Tinham frequência relevante, mas estão entre 16 e 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Hibernando', 'hibernando', 'RFM — Hibernando', 'Segmento RFM dinâmico. Estão há mais de 30 dias sem comprar, mas ainda possuem frequência ou valor relevante. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Não pode perder', 'nao-pode-perder', 'RFM — Não pode perder', 'Segmento RFM dinâmico. Eram clientes frequentes e de alto valor, mas estão há mais de 15 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Perdidos', 'perdidos', 'RFM — Perdidos', 'Segmento RFM dinâmico. Baixa frequência, baixo valor e mais de 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.')
)
UPDATE public.crm_segments AS segment
SET
  descricao = definition.descricao,
  regras = jsonb_build_object(
    'groups',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'rfm-' || definition.slug,
        'type', 'AND',
        'conditions',
        jsonb_build_array(
          jsonb_build_object(
            'id', 'rfm-' || definition.slug || '-condition',
            'category', 'rfm',
            'field', 'rfm_segment',
            'label', 'Segmento RFM',
            'operator', 'eq',
            'value', definition.segmento
          )
        )
      )
    )
  ),
  atualizado_em = now()
FROM definitions AS definition
WHERE lower(trim(segment.nome)) = lower(trim(definition.nome));

WITH definitions(segmento, slug, nome, descricao) AS (
  VALUES
    ('Sem compra', 'sem-compra', 'RFM — Sem compra', 'Segmento RFM dinâmico. Lead sem pedido pago. Permanece identificado fora da matriz dos compradores. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Campeões', 'campeoes', 'RFM — Campeões', 'Segmento RFM dinâmico. Compraram recentemente, têm alta frequência e estão entre os clientes de maior valor. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Leais', 'leais', 'RFM — Leais', 'Segmento RFM dinâmico. Compram com frequência e mantêm relacionamento recente com a loja. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Potencialmente Leais', 'potencialmente-leais', 'RFM — Potencialmente Leais', 'Segmento RFM dinâmico. Já fizeram a segunda compra recentemente e têm potencial para se tornar leais. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Novos', 'novos', 'RFM — Novos', 'Segmento RFM dinâmico. Fizeram a primeira compra dentro da janela recente de até 8 dias. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Precisa de atenção', 'precisa-atencao', 'RFM — Precisa de atenção', 'Segmento RFM dinâmico. Estão entre 9 e 15 dias sem comprar e ultrapassando o ciclo normal de recompra. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Quase hibernando', 'quase-hibernando', 'RFM — Quase hibernando', 'Segmento RFM dinâmico. Baixa frequência e entre 16 e 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Em risco', 'em-risco', 'RFM — Em risco', 'Segmento RFM dinâmico. Tinham frequência relevante, mas estão entre 16 e 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Hibernando', 'hibernando', 'RFM — Hibernando', 'Segmento RFM dinâmico. Estão há mais de 30 dias sem comprar, mas ainda possuem frequência ou valor relevante. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Não pode perder', 'nao-pode-perder', 'RFM — Não pode perder', 'Segmento RFM dinâmico. Eram clientes frequentes e de alto valor, mas estão há mais de 15 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.'),
    ('Perdidos', 'perdidos', 'RFM — Perdidos', 'Segmento RFM dinâmico. Baixa frequência, baixo valor e mais de 30 dias sem comprar. A composição é atualizada automaticamente após cada recálculo da RFM.')
)
INSERT INTO public.crm_segments (id, nome, descricao, regras, criado_em, atualizado_em)
SELECT
  gen_random_uuid(),
  definition.nome,
  definition.descricao,
  jsonb_build_object(
    'groups',
    jsonb_build_array(
      jsonb_build_object(
        'id', 'rfm-' || definition.slug,
        'type', 'AND',
        'conditions',
        jsonb_build_array(
          jsonb_build_object(
            'id', 'rfm-' || definition.slug || '-condition',
            'category', 'rfm',
            'field', 'rfm_segment',
            'label', 'Segmento RFM',
            'operator', 'eq',
            'value', definition.segmento
          )
        )
      )
    )
  ),
  now(),
  now()
FROM definitions AS definition
WHERE NOT EXISTS (
  SELECT 1
  FROM public.crm_segments AS existing
  WHERE lower(trim(existing.nome)) = lower(trim(definition.nome))
);
