"""Reaponta os webhooks de entrada (Meta WhatsApp/Instagram e UazAPI) para o CRM novo.
Uso: python 06_webhooks.py            -> só LISTA para onde cada webhook aponta hoje (não altera nada)
     python 06_webhooks.py --apply    -> troca o callback para https://crm.maniadmulher.com/...
Lê as credenciais de store_settings do hfm (crm). Nunca imprime tokens/segredos."""
import json, sys, urllib.parse, urllib.request, urllib.error

APPLY = "--apply" in sys.argv
NEW = "https://crm.maniadmulher.com"
PATHS = {"whatsapp_business_account": "/api/whatsapp-webhook", "instagram": "/api/instagram-webhook"}
GRAPH = "https://graph.facebook.com/v21.0"
KEY = open(r"C:\Users\rmalv\hfm-key.txt", encoding="utf-8").read().strip()
HDR = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept-Profile": "crm"}


def call(method, url, headers=None, data=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body[:300]}


st, rows = call("GET", "https://letaopgwhwniovmwehfm.supabase.co/rest/v1/store_settings?select=*&order=created_at.asc&limit=1", HDR)
s = rows[0] if st == 200 and rows else {}
print("store_settings lida:", bool(s))

# ---------------- Meta (nível do app)
app_id, secret, verify = s.get("whatsapp_meta_app_id"), s.get("whatsapp_meta_app_secret"), s.get("whatsapp_meta_verify_token")
if not (app_id and secret and verify):
    print("Meta: faltam app_id/app_secret/verify_token no store_settings — pulando")
else:
    tok = urllib.parse.quote(f"{app_id}|{secret}")
    st, body = call("GET", f"{GRAPH}/{app_id}/subscriptions?access_token={tok}")
    subs = (body or {}).get("data", []) if st == 200 else []
    print("Meta: assinaturas atuais" if st == 200 else f"Meta: erro HTTP {st} {body}")
    for sub in subs:
        obj = sub.get("object")
        fields = [f["name"] for f in sub.get("fields", [])]
        want = NEW + PATHS.get(obj, "")
        print(f"  - {obj}: {sub.get('callback_url')} | campos={','.join(fields)} | ativa={sub.get('active')} | destino novo={want if obj in PATHS else '(objeto não tratado)'}")
        if APPLY and obj in PATHS and sub.get("callback_url") != want:
            payload = urllib.parse.urlencode({"object": obj, "callback_url": want, "fields": ",".join(fields), "verify_token": verify, "access_token": f"{app_id}|{secret}"}).encode()
            st2, b2 = call("POST", f"{GRAPH}/{app_id}/subscriptions", {"Content-Type": "application/x-www-form-urlencoded"}, payload)
            print(f"    -> POST HTTP {st2} {json.dumps(b2)[:200]}")

# ---------------- UazAPI
url, tok = (s.get("uazapi_url") or "").rstrip("/"), s.get("uazapi_token")
if not (url and tok):
    print("UazAPI: sem uazapi_url/uazapi_token — pulando")
else:
    st, cur = call("GET", f"{url}/webhook", {"token": tok})
    hooks = cur if isinstance(cur, list) else []
    print(f"UazAPI: webhooks atuais (HTTP {st})")
    for w in hooks:
        print(f"  - id={w.get('id')} ativo={w.get('enabled')} url={w.get('url')}")
    want = NEW + "/api/uazapi-webhook"
    # CUIDADO: a instância pode ser compartilhada com outro sistema (ex.: OrderZaps/Cartzy, host hxtbsieodbtzgcvvkeqx).
    # Só mexe em webhook que hoje aponta para o app antigo do CRM (lovable.app); os demais ficam como estão.
    mine = [w for w in hooks if "clever-ship-analyzer.lovable.app" in (w.get("url") or "")]
    print(f"UazAPI: {len(mine)} webhook(s) apontando para o CRM antigo; {len(hooks) - len(mine)} de outros sistemas (intocados)")
    if APPLY:
        for w in mine:
            body = json.dumps({"id": w["id"], "url": want, "enabled": True, "events": w.get("events") or ["messages", "messages_update", "connection", "presence", "groups"], "addUrlEvents": False, "addUrlTypesMessages": False}).encode()
            st2, b2 = call("POST", f"{url}/webhook", {"token": tok, "Content-Type": "application/json"}, body)
            print(f"  -> {w['id']}: HTTP {st2}", json.dumps(b2)[:200])
print("FEITO" if APPLY else "(simulação — rode com --apply para trocar)")
