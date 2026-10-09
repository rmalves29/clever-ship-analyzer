# Virada: CRM 100% no Supabase do usuário (hfm) — runbook

Objetivo: parar de usar o banco do Lovable Cloud (**hqlw** `hqlwujrbjacrvjwzsabo`) e passar a usar só o Supabase do usuário
(**hfm** `letaopgwhwniovmwehfm`, schema `crm`). O app novo já roda em https://crm.maniadmulher.com (Vercel, projeto `crm`)
lendo o hfm. O Lovable continua publicado (links antigos `/r/` e `/fluxo/`), mas com dados congelados.

Scripts em `scripts/virada/`. Pasta de trabalho sugerida: `C:\Users\rmalv\virada-work` (fora do repo; contém dados de clientes).

## Regras que não podem ser quebradas
- Nunca imprimir chaves/tokens/segredos (a chave do hfm está em `C:\Users\rmalv\hfm-key.txt`).
- NÃO truncar nem recarregar o hfm do zero. Os 36.299 clientes `tray-cli-*` (e as colunas `hist_*`) só existem no hfm — a carga é *upsert* e não toca neles.
- NÃO mexer no schema `public` do hfm (é de outro sistema do usuário).
- O webhook da UazAPI na instância do `store_settings` aponta para o OrderZaps (host `hxtbsieodbtzgcvvkeqx`): não alterar.
- Nada de apagar sem o dry-run mostrado antes. Em dúvida, parar e perguntar ao usuário.

## Ordem (cada fase só começa se a anterior deu certo)

### Fase 0 — pré-checagem (não altera nada)
1. `curl -s -o NUL -w "%{http_code}" https://crm.maniadmulher.com/api/popup/loader.js` → 200.
2. Supabase MCP `execute_sql` no hfm: `select jobid, jobname, active from cron.job order by 1;` → jobs 9–14 devem estar `active=false`.
3. Lovable MCP (`query_database`, projeto `da6e5b78-545b-4168-960b-aa496e4747bf`) responde: `select jobid, jobname, active from cron.job order by 1;` → jobs 1–11 ativos.
   Se o conector do Lovable pedir autenticação, **parar** e avisar o usuário (não dá para pausar os crons antigos sem ele).

### Fase 1 — congelar o Lovable
`select cron.alter_job(jobid, active := false) from cron.job where jobid between 1 and 11;` e conferir `active=false` em todos.
Anotar a hora (T0). Reversível: `active := true`.

### Fase 2 — export (só o usuário consegue)
O usuário precisa clicar **"Export data"** no Lovable (Cloud → Database) e baixar o `.backup` em `C:\Users\rmalv\Downloads`.
Avisar o usuário (notificação + mensagem) e esperar até 30 min por um `*.backup` com data **posterior a T0**.
Se não chegar: **rollback** (reativar crons 1–11), avisar que a virada foi adiada e parar. Nada mais foi alterado.

### Fase 3 — carga no hfm
```
mkdir C:\Users\rmalv\virada-work ; cd C:\Users\rmalv\virada-work
copy <repo>\scripts\virada\*  .
python 01_extract.py "C:\Users\rmalv\Downloads\<arquivo>.backup" .
node 02_unz.mjs
node 02_load.mjs          # upsert; imprime OK/DIF por tabela
```
Esperado: tudo `OK`, **exceto** `shopify_customers` (hfm tem +36.299 `tray-cli-*`) e as de campanhas do WhatsApp (hfm tem linhas extras "espelho"; ver Fase 4).
Qualquer outro `DIF` → investigar antes de seguir (comparar com o relatório `load-report.json`).

### Fase 4 — limpeza e arquivos
1. `node 03_prune.mjs` (simulação). Só rodar `--apply` se tudo que aparece como "só no hfm" for de **antes de 2026-10-09** (são as campanhas espelho). Se houver linhas criadas depois, mostrar ao usuário e perguntar.
2. `python 04_objects.py` (gera `objects.json` a partir do backup) e `node 05_copy_storage.mjs` (copia os arquivos dos buckets do hqlw para o hfm; idempotente).
3. Supabase MCP `execute_sql` no hfm com o conteúdo de `04_post_load.sql` (troca URLs do Storage antigo pelas do novo). A consulta final tem que dar 0 em todas as linhas (exceto o histórico de `whatsapp_inbox_messages`).
4. Conferir que nenhuma configuração aponta para `hqlwujrbjacrvjwzsabo` (ex.: `select key from crm.store_settings` não deve ter essa string em nenhum valor).

### Fase 5 — ligar o hfm
`select cron.alter_job(jobid, active := true) from cron.job where jobid between 9 and 14;` (jobs que chamam `https://crm.maniadmulher.com/...`).
Só agora, depois da carga: assim itens de fila já enviados no Lovable (status `sent` no backup) não são reenviados.
Conferir em ~5 min `cron.job_run_details` (sem erro) e que o app responde.

### Fase 6 — apontar quem envia dados para o CRM
1. `python 06_webhooks.py` (lista) e depois `python 06_webhooks.py --apply`: troca as assinaturas da Meta (WhatsApp e Instagram) de `clever-ship-analyzer.lovable.app` para `crm.maniadmulher.com`. UazAPI só é mexido se algum webhook ainda apontar para o lovable.app.
2. Pop-up da loja (Shopify MCP): no tema MAIN `gid://shopify/OnlineStoreTheme/188657762482`, arquivo `layout/theme.liquid`, trocar
   `https://clever-ship-analyzer.lovable.app/api/popup/loader.js` por `https://crm.maniadmulher.com/api/popup/loader.js` (`themeFilesUpsert`).
   Se o token não tiver permissão de escrita, entregar ao usuário a linha exata para colar.
3. Delta: o que chegou no Lovable entre o export e a troca dos webhooks (mensagens recebidas, visitas, leads). Comparar contagens; se for pouco (< 200 linhas por tabela) copiar via `query_database` → `execute_sql` com `on conflict do nothing`; se for muito, avisar o usuário.

### Fase 7 — fechamento
- Pedir ao usuário para abrir o CRM e clicar **Recalcular RFM** (a carga sobrescreve `rfm_segment` dos clientes antigos com os valores do Lovable; o app novo recalcula com o histórico da Tray).
- Atualizar a memória do projeto (`project-live-launchpad` / `project-import-clientes-tray`) com: virada concluída, data/hora, crons ativos, Lovable congelado.
- Relatório final ao usuário: contagens por tabela, o que foi copiado, o que ficou de fora, e o que ele deve conferir (login, uma venda recente no dashboard, envio de teste no WhatsApp).

## Rollback
- **Antes da Fase 5:** `select cron.alter_job(jobid, active := true) from cron.job where jobid between 1 and 11;` no Lovable. O hfm só recebeu *upserts* inofensivos.
- **Depois da Fase 5:** desativar crons 9–14 no hfm; reativar 1–11 no Lovable; `06_webhooks.py` não tem "voltar" automático — reapontar manualmente para `https://clever-ship-analyzer.lovable.app/api/whatsapp-webhook` e `/api/instagram-webhook` (mesmo `verify_token`); devolver a linha do loader no tema. Dados que entraram no hfm depois da Fase 5 precisam ser copiados de volta (avisar o usuário).
