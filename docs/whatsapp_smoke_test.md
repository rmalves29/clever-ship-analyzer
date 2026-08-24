# Smoke test real de 1 mensagem (WhatsApp / Meta Cloud API)

Estado atual: **preparado, NÃO executado.** Nenhuma chamada foi feita à Meta/UazAPI.

## Pré-condições já validadas
- Template `teste_queue_ptbr` (ID `1741623420494487`) — `APPROVED`, idioma `pt_BR`, categoria `MARKETING`.
- Fila `public.whatsapp_message_queue` + RPCs `claim_whatsapp_message_queue` e `requeue_stale_whatsapp_queue` aplicadas.
- Worker validado com provider MOCK: claim atômico, sent, retry/backoff, esgotamento de tentativas, stale requeue, concorrência.
- Nenhum cron aponta para `/api/whatsapp/queue-tick` (worker só roda sob comando manual).

## Job real de teste (inerte)
`id = 19addc38-79b8-4ba7-a942-b5b82db7a878`, contato `5531992904210`, `status = queued`,
`attempts = 0`, `scheduled_at` em 2036 → nunca elegível.

## Passo 1 — armar o job (única alteração de dados necessária)
```sql
update public.whatsapp_message_queue
set template_name     = 'teste_queue_ptbr',
    template_language = 'pt_BR',
    body_params       = '[]'::jsonb,
    status            = 'queued',
    attempts          = 0,
    max_attempts      = 1,          -- sem retry automático no smoke test
    error             = null,
    next_attempt_at   = null,
    scheduled_at      = now()
where id = '19addc38-79b8-4ba7-a942-b5b82db7a878';
```

## Passo 2 — rodar exatamente 1 lote (envio REAL)
```bash
curl -s -X POST -H "X-Automation-Secret: <automation_tick_secret>" \
  'https://clever-ship-analyzer.lovable.app/api/whatsapp/queue-tick?limit=1'
```
Alternativa autenticada pela UI: botão "processar fila" (server fn `runWhatsappQueueTick`,
protegido por `requireSupabaseAuth`).

## Passo 3 — verificar
```sql
select status, attempts, wa_message_id, sent_at, error
from public.whatsapp_message_queue
where id = '19addc38-79b8-4ba7-a942-b5b82db7a878';
```
Esperado: `status = sent`, `wa_message_id` real (`wamid....`), `sent_at` preenchido.
O webhook `/api/whatsapp-webhook` atualiza depois `delivered`/`read` via `applyMetaStatusUpdate`.

## Passo 4 — depois do teste
Reagendar o job para 2036 ou removê-lo, e só então avaliar ligar o cron do worker.

## Resultado do smoke test real (24/08/2026 01:05 UTC)
Executado 1 lote (`limit=1`) com o job `19addc38...` e o template `teste_queue_ptbr`.
- Worker: `claimed:1 sent:0 failed:1` — arquitetura funcionou fim a fim.
- Meta respondeu: `(#133010) Account not registered`.
- Token da Meta: VALIDO (`/me`, phone number e templates retornaram 200).
- Diagnostico do numero `1104775929375335` (+1 555-772-5720): `status = PENDING`,
  `platform_type = NOT_APPLICABLE` -> numero ainda NAO registrado na Cloud API.

## Bloqueio atual
Registrar o numero na Cloud API (`POST /{phone-number-id}/register` com PIN de 6 digitos
definido pelo usuario) ou usar um numero ja registrado. Enquanto isso, nenhum envio real
e possivel. Job devolvido ao estado inerte (`queued`, `attempts 0`, agendado para 2036).
