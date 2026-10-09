"""Importa a exportação completa de clientes da Tray para o CRM (hfm.crm).
Uso: python tray_upload.py            -> só simula e imprime os números
     python tray_upload.py --apply    -> grava
Nunca imprime a chave. Idempotente (ids fixos; conflito = ignora)."""
import csv, re, json, sys, collections, datetime, urllib.request

APPLY = "--apply" in sys.argv
SRC = r"C:\Users\rmalv\Downloads\clientes_928620_6861462e-5120-4f8b-af24-353c14fb6763.csv"
KEY = open(r"C:\Users\rmalv\hfm-key.txt", encoding="utf-8").read().strip()
BASE = "https://letaopgwhwniovmwehfm.supabase.co/rest/v1/shopify_customers"
HDR = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Accept-Profile": "crm", "Content-Profile": "crm"}
TICKET = 198.00
HIST_SOURCE = "tray_csv_2026-10-09"
ID_PREFIX = "tray-cli-"

dg = lambda s: re.sub(r"\D", "", s or "")
unq = lambda s: (s or "").strip().strip("'").strip()

def key11(raw):
    d = dg(unq(raw))
    if d.startswith("55") and len(d) in (12, 13): d = d[2:]
    if len(d) == 10 and d[2] in "6789": d = d[:2] + "9" + d[2:]
    if len(d) == 11 and d[2] == "9" and d[:2] >= "11" and len(set(d[2:])) > 1: return d
    return None

def phone_store(raw):
    k = key11(raw)
    if k: return "+55" + k
    d = dg(unq(raw))
    if len(d) == 10 and d[:2] >= "11" and len(set(d[2:])) > 1: return "+55" + d
    return None

def parse_date(s):
    s = (s or "").strip()
    try: return datetime.datetime.strptime(s, "%d/%m/%Y").date()
    except Exception: return None

# ---------- existentes no CRM
existing = []
off = 0
while True:
    r = urllib.request.Request(BASE + "?select=id,email,phone&order=id&limit=1000&offset=%d" % off, headers=HDR)
    b = json.load(urllib.request.urlopen(r)); existing += b
    if len(b) < 1000: break
    off += 1000
ex_phone, ex_email = set(), set()
for c in existing:
    k = key11(c["phone"])
    if k: ex_phone.add(k)
    if c["email"]: ex_email.add(c["email"].strip().lower())
already_done = {c["id"] for c in existing if c["id"].startswith(ID_PREFIX)}
print("clientes já no CRM:", len(existing), "| deles de execução anterior deste import:", len(already_done))

rows = list(csv.reader(open(SRC, encoding="latin-1", newline=""), delimiter=";"))[1:]
reasons = collections.Counter()
keep = []
for r in rows:
    code, cad, nome, cpf, cidade, uf, email = r[0].strip(), r[1], r[3].strip(" ,;"), unq(r[6]), r[8].strip(), r[9].strip(), r[12].strip().lower()
    t1, t2, ult, tot, obs, news, tipo, pais, bloq = r[13], r[14], parse_date(r[15]), r[17].strip(), r[18], r[19], r[20].strip(), r[31], r[32].strip()
    try: pedidos = int(tot or 0)
    except Exception: pedidos = 0
    ek = email if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) else None
    if (ek and ek.endswith("@tray.net.br")) or "teste" in obs.lower() or "NÃO ALTERAR" in nome.upper() or "NÃO ALTERAR" in r[21].upper():
        reasons["teste"] += 1; continue
    if bloq == "1": reasons["bloqueado"] += 1; continue
    if tipo == "1": reasons["empresa (PJ)"] += 1; continue
    keys = {k for k in (key11(t2), key11(t1)) if k}
    if (ek and ek in ex_email) or (keys & ex_phone) or (ID_PREFIX + code) in already_done:
        reasons["já cadastrado no CRM"] += 1; continue
    keep.append(dict(code=code, cad=parse_date(cad), nome=nome, cidade=cidade, uf=uf, email=ek, t1=t1, t2=t2, keys=keys, ult=ult, pedidos=pedidos, pais=pais.strip()))

# duplicados dentro do próprio arquivo (mesmo telefone ou e-mail): mantém o de mais pedidos / compra mais recente
keep.sort(key=lambda x: (-x["pedidos"], -(x["ult"].toordinal() if x["ult"] else 0), x["code"]))
seen_phone, seen_email, final = set(), set(), []
for x in keep:
    if (x["keys"] & seen_phone) or (x["email"] and x["email"] in seen_email):
        reasons["repetido dentro do arquivo"] += 1; continue
    seen_phone |= x["keys"]
    if x["email"]: seen_email.add(x["email"])
    final.append(x)

buyers = [x for x in final if x["pedidos"] > 0 and x["ult"]]
nodate = [x for x in final if x["pedidos"] > 0 and not x["ult"]]
nobuy = [x for x in final if x["pedidos"] == 0]
print("\nLinhas no arquivo:", len(rows))
for k, v in reasons.items(): print("  não subiu -", k + ":", v)
print("A subir:", len(final), "= com compras", len(buyers), "+ sem compra", len(nobuy), "+ com pedidos mas sem data da última compra (entram como sem compra)", len(nodate))
print("pedidos dos compradores:", sum(x["pedidos"] for x in buyers), "| valor estimado total R$ %.2f" % (sum(x["pedidos"] for x in buyers) * TICKET))
print("sem telefone válido:", sum(1 for x in final if not (x["keys"] or phone_store(x["t2"]) or phone_store(x["t1"]))), "| sem e-mail:", sum(1 for x in final if not x["email"]))
json.dump({"reasons": dict(reasons), "final": len(final), "buyers": len(buyers), "nobuy": len(nobuy), "nodate": len(nodate)}, open("tray_upload_result.json", "w"), ensure_ascii=False)

if not APPLY:
    sys.exit(0)

def split_name(n):
    n = re.sub(r"\s+", " ", n).strip()
    if not n or "@" in n or re.fullmatch(r"[+0-9\s-]*", n): return None, None
    first, _, rest = n.partition(" ")
    return first, (rest or None)

def to_row(x):
    first, last = split_name(x["nome"])
    phone = phone_store(x["t2"]) or phone_store(x["t1"])
    created = (x["cad"] or datetime.date.today())
    has_hist = x["pedidos"] > 0 and x["ult"] is not None
    tags = ["tray-clientes", "sem-automacao"] + (["sem-data-ultima-compra"] if x["pedidos"] > 0 and not x["ult"] else [])
    row = {
        "id": ID_PREFIX + x["code"], "email": x["email"], "first_name": first, "last_name": last, "phone": phone,
        "city": x["cidade"] or None, "province": x["uf"] or None, "country": "BR" if x["pais"].lower() in ("brasil", "") else x["pais"],
        "created_at": datetime.datetime.combine(created, datetime.time(12, 0), datetime.timezone.utc).isoformat(),
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tags": [], "tags_custom": tags,
        "last_purchase_at": datetime.datetime.combine(x["ult"], datetime.time(12, 0), datetime.timezone.utc).isoformat() if has_hist else None,
        "hist_orders_count": x["pedidos"] if has_hist else None,
        "hist_estimated_value": round(x["pedidos"] * TICKET, 2) if has_hist else None,
        "hist_source": HIST_SOURCE if has_hist else None,
    }
    return row

payload_rows = [to_row(x) for x in final]
H2 = dict(HDR); H2.update({"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates,return=minimal"})
sent = 0
for i in range(0, len(payload_rows), 500):
    chunk = payload_rows[i:i + 500]
    req = urllib.request.Request(BASE + "?on_conflict=id", data=json.dumps(chunk).encode("utf-8"), headers=H2, method="POST")
    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        print("ERRO no lote", i, e.code, e.read().decode()[:300]); sys.exit(1)
    sent += len(chunk)
    if (i // 500) % 10 == 0: print("enviados", sent)
print("ENVIADOS:", sent)
