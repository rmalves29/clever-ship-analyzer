// Depois da carga: lista (e, com --apply, apaga) linhas que existem no hfm.crm mas NÃO estão no backup do Lovable,
// nas tabelas em que isso é esperado (campanhas "espelho" criadas só no banco novo).
// Uso (na pasta de trabalho, a mesma do 02_load): node 03_prune.mjs [--apply]
// Sem --apply só imprime. Nunca mexe em shopify_customers (os tray-cli-* ficam).
import fs from "node:fs";

const KEY = fs.readFileSync("C:/Users/rmalv/hfm-key.txt", "utf8").trim();
const BASE = "https://letaopgwhwniovmwehfm.supabase.co/rest/v1";
const APPLY = process.argv.includes("--apply");
const schema = JSON.parse(fs.readFileSync("schema.json", "utf8"));
const H = (x = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "crm", "Content-Profile": "crm", ...x });

// ordem importa: filhos antes dos pais
const TABLES = [
  { t: "whatsapp_campaign_recipients", label: "campaign_id" },
  { t: "whatsapp_campaigns", label: "nome" },
];

function dumpIds(t) {
  const idx = schema[t].findIndex((c) => c.name === "id");
  const text = fs.readFileSync(`copy/public.${t}.copy`, "utf8");
  return new Set(text.split("\n").filter((l) => l.length && l !== "\\.").map((l) => l.split("\t")[idx]));
}

async function allIds(t, extra) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${BASE}/${t}?select=id,created_at${extra ? "," + extra : ""}&order=id&limit=1000&offset=${off}`, { headers: H() });
    if (!r.ok) throw new Error(`${t}: HTTP ${r.status} ${await r.text()}`);
    const b = await r.json();
    out.push(...b);
    if (b.length < 1000) break;
  }
  return out;
}

for (const { t, label } of TABLES) {
  const keep = dumpIds(t);
  const rows = await allIds(t, label);
  const extra = rows.filter((r) => !keep.has(String(r.id)));
  const dates = extra.map((r) => r.created_at).sort();
  console.log(`${t}: hfm ${rows.length} | backup ${keep.size} | só no hfm ${extra.length}` + (extra.length ? ` | criadas de ${dates[0]} a ${dates.at(-1)}` : ""));
  if (!APPLY || extra.length === 0) continue;
  for (let i = 0; i < extra.length; i += 100) {
    const ids = extra.slice(i, i + 100).map((r) => r.id).join(",");
    const r = await fetch(`${BASE}/${t}?id=in.(${ids})`, { method: "DELETE", headers: H({ Prefer: "return=minimal" }) });
    if (!r.ok) throw new Error(`${t}: DELETE HTTP ${r.status} ${await r.text()}`);
  }
  console.log(`  apagadas ${extra.length}`);
}
if (!APPLY) console.log("(simulação — nada foi apagado; rode com --apply)");
