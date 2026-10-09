# Gera objects.json (lista de arquivos do Storage do Lovable) a partir do backup já extraído. Rode na pasta de trabalho.
import json, re, collections

man = json.load(open("manifest.json"))
m = [x for x in man if x["name"] == "storage.objects"][0]
cols = [c.strip().strip('"') for c in re.match(r"COPY storage\.objects \((.*)\) FROM stdin;", m["copy"]).group(1).split(",")]
print(cols)
NL = chr(10)
TERM = chr(92) + "."
NULL = chr(92) + "N"
rows = [l.split(chr(9)) for l in open("copy/storage.objects.copy", encoding="utf-8").read().split(NL) if l and l != TERM]
print(len(rows), "objetos")
ib, inm, imeta = cols.index("bucket_id"), cols.index("name"), cols.index("metadata")
print(collections.Counter(r[ib] for r in rows))
objs = []
for r in rows:
    raw = r[imeta]
    meta = {}
    if raw != NULL:
        try:
            meta = json.loads(raw.replace(chr(92) * 2, chr(92)))
        except Exception:
            meta = {}
    objs.append({"bucket": r[ib], "name": r[inm], "mime": meta.get("mimetype"), "size": meta.get("size")})
json.dump(objs, open("objects.json", "w"))
print(round(sum(o["size"] or 0 for o in objs) / 1e6, 1), "MB")
