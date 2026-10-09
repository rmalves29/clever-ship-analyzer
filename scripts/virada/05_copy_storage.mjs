// Copia os arquivos dos buckets públicos do CRM (Lovable Cloud) para o Supabase hfm. Idempotente.
import fs from "node:fs";

const KEY = fs.readFileSync("C:/Users/rmalv/hfm-key.txt", "utf8").trim();
const SRC = "https://hqlwujrbjacrvjwzsabo.supabase.co/storage/v1/object/public";
const DST = "https://letaopgwhwniovmwehfm.supabase.co/storage/v1";
const objs = JSON.parse(fs.readFileSync("objects.json", "utf8"));
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const enc = (name) => name.split("/").map(encodeURIComponent).join("/");

const buckets = [...new Set(objs.map((o) => o.bucket))];
for (const id of buckets) {
  const r = await fetch(`${DST}/bucket`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ id, name: id, public: true }) });
  const t = await r.text();
  console.log(`bucket ${id}: HTTP ${r.status} ${r.ok ? "criado" : t.slice(0, 120)}`);
}

let ok = 0, falhas = [], bytes = 0;
for (const o of objs) {
  try {
    const g = await fetch(`${SRC}/${o.bucket}/${enc(o.name)}`);
    if (!g.ok) throw new Error(`download HTTP ${g.status}`);
    const buf = Buffer.from(await g.arrayBuffer());
    const type = o.mime || g.headers.get("content-type") || "application/octet-stream";
    const p = await fetch(`${DST}/object/${o.bucket}/${enc(o.name)}`, { method: "POST", headers: { ...auth, "content-type": type, "x-upsert": "true", "cache-control": "max-age=3600" }, body: buf });
    if (!p.ok) throw new Error(`upload HTTP ${p.status} ${(await p.text()).slice(0, 150)}`);
    // confere: baixa do destino e compara tamanho
    const c = await fetch(`https://letaopgwhwniovmwehfm.supabase.co/storage/v1/object/public/${o.bucket}/${enc(o.name)}`, { method: "HEAD" });
    const len = Number(c.headers.get("content-length") ?? -1);
    if (len !== buf.length) throw new Error(`tamanho diferente: origem ${buf.length}, destino ${len}`);
    ok++; bytes += buf.length;
    if (ok % 20 === 0) console.log(`... ${ok}/${objs.length}`);
  } catch (e) {
    falhas.push({ bucket: o.bucket, name: o.name, erro: String(e.message) });
    console.log(`FALHA ${o.bucket}/${o.name}: ${e.message}`);
  }
}
console.log(`copiados e conferidos: ${ok}/${objs.length} (${(bytes / 1e6).toFixed(1)} MB) | falhas: ${falhas.length}`);
fs.writeFileSync("copy-storage-report.json", JSON.stringify({ ok, total: objs.length, falhas }, null, 1));
