"""Extrai as tabelas do backup do Lovable Cloud (pg_dump custom, zstd) para a pasta de trabalho.
Uso: python 01_extract.py <arquivo.backup> <pasta_de_trabalho>
Gera: <pasta>/raw/<ns.tabela>.zst e <pasta>/manifest.json. Depois rode: node 02_unz.mjs (na pasta) para gerar copy/*.copy."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgdump_reader import Dump

src, work = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(work, "raw"), exist_ok=True)
d = Dump(src)
manifest = []
for e in d.toc:
    if e["desc"] != "TABLE DATA" or e["flag"] != 2:
        continue
    d.f.seek(e["offset"])
    btype = d.f.read(1)[0]
    dump_id = d.read_int()
    assert btype == 1 and dump_id == e["dump_id"], "bloco de dados inesperado"
    chunks = []
    while True:
        n = d.read_int()
        if n == 0:
            break
        chunks.append(d.f.read(n))
    raw = b"".join(chunks)
    name = f'{e["namespace"]}.{e["tag"]}'
    with open(os.path.join(work, "raw", name + ".zst"), "wb") as fh:
        fh.write(raw)
    manifest.append({"name": name, "ns": e["namespace"], "table": e["tag"], "copy": e["copy"], "zst_bytes": len(raw)})
json.dump(manifest, open(os.path.join(work, "manifest.json"), "w"), ensure_ascii=False)
print(f"{len(manifest)} tabelas extraídas de {os.path.basename(src)} (compressão {d.compression})")
