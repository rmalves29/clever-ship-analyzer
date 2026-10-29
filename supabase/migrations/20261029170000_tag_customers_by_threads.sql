-- Marca clientes (tags_custom) a partir de conversas do WhatsApp.
-- Liga a conversa ao cliente pelo vínculo (customer_id) ou, se não houver, pelo telefone
-- (DDD + últimos 8 dígitos, para casar números com e sem o 9º dígito). Idempotente.
create or replace function crm.tag_customers_by_threads(p_thread_ids uuid[], p_tag text)
returns integer
language plpgsql
security definer
set search_path = crm, public
as $$
declare
  n integer;
begin
  with th as (
    select id, customer_id, regexp_replace(phone, '\D', '', 'g') as ph
    from crm.whatsapp_inbox_threads
    where id = any(p_thread_ids)
  ),
  alvo as (
    select customer_id as id from th where customer_id is not null
    union
    select c.id
    from th
    join crm.shopify_customers c
      on th.customer_id is null
     and c.phone is not null
     and substr(regexp_replace(regexp_replace(c.phone, '\D', '', 'g'), '^55', ''), 1, 2) = substr(regexp_replace(th.ph, '^55', ''), 1, 2)
     and right(regexp_replace(c.phone, '\D', '', 'g'), 8) = right(th.ph, 8)
  ),
  upd as (
    update crm.shopify_customers s
       set tags_custom = array_append(coalesce(s.tags_custom, '{}'::text[]), p_tag)
     where s.id in (select id from alvo)
       and not (p_tag = any(coalesce(s.tags_custom, '{}'::text[])))
    returning 1
  )
  select count(*) into n from upd;
  return n;
end;
$$;

revoke all on function crm.tag_customers_by_threads(uuid[], text) from public;
grant execute on function crm.tag_customers_by_threads(uuid[], text) to service_role;
