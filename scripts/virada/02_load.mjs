// Carrega o backup (arquivos .copy) no schema crm do Supabase hfm via PostgREST. Idempotente (upsert).
// Uso: node load.mjs [tabela1,tabela2,...]   — sem argumento carrega tudo e confere as contagens.
import fs from "node:fs";

const KEY = fs.readFileSync("C:/Users/rmalv/hfm-key.txt", "utf8").trim();
const BASE = "https://letaopgwhwniovmwehfm.supabase.co/rest/v1";
const man = JSON.parse(fs.readFileSync("manifest.json", "utf8")).filter((m) => m.ns === "public");
const schema = JSON.parse(fs.readFileSync("schema.json", "utf8"));
// enums sem tipo no dump
for (const c of schema.flow_automations) if (c.type === "?") c.type = c.name === "trigger_kinds" ? "text[]" : "text";
for (const c of schema.flow_dispatch_logs) if (c.type === "?") c.type = "text";

const PK = { automation_tick_locks: "name", flow_dispatch_dedup: "automation_id,ig_user_id", whatsapp_suppressions: "phone" };
const BATCH = { site_visits: 5000, whatsapp_inbox_messages: 1000, wa_campaign_recipients: 1000, shopify_orders: 300, whatsapp_automation_runs: 500, flow_webhook_events: 300 };
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;

const headers = (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Profile": "crm", "Accept-Profile": "crm", ...extra });

function unescapeCopy(f) {
  if (f === "\\N") return null;
  if (!f.includes("\\")) return f;
  let out = "";
  for (let i = 0; i < f.length; i++) {
    const c = f[i];
    if (c === "\\" && i + 1 < f.length) {
      const d = f[++i];
      out += { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "\\": "\\" }[d] ?? d;
    } else out += c;
  }
  return out;
}

// literal de array do Postgres ({a,"b c",NULL}) -> array JS
function parsePgArray(s) {
  if (s === "{}") return [];
  const out = [];
  let i = 1, cur = "", q = false, was = false;
  for (; i < s.length - 1; i++) {
    const c = s[i];
    if (q) {
      if (c === "\\") cur += s[++i];
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') { q = true; was = true; }
    else if (c === ",") { out.push(!was && cur === "NULL" ? null : cur); cur = ""; was = false; }
    else cur += c;
  }
  out.push(!was && cur === "NULL" ? null : cur);
  return out;
}

function convert(type, v) {
  if (v === null) return null;
  if (type === "jsonb" || type === "json") return JSON.parse(v);
  if (type === "boolean") return v === "t";
  if (type.endsWith("[]")) return parsePgArray(v);
  return v; // numéricos/datas/uuid/texto: o Postgres converte do texto
}

async function post(table, rows) {
  const pk = PK[table] ?? "id";
  const url = `${BASE}/${table}?on_conflict=${pk}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await fetch(url, { method: "POST", headers: headers({ "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
      if (r.ok) return;
      const t = await r.text();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}: ${t.slice(0, 400)}`);
      if (attempt === 5) throw new Error(`HTTP ${r.status} após 5 tentativas: ${t.slice(0, 200)}`);
    } catch (e) {
      if (String(e.message).startsWith("HTTP 4")) throw e;
      if (attempt === 5) throw e;
    }
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}

async function destCount(table) {
  const r = await fetch(`${BASE}/${table}?select=*`, { method: "HEAD", headers: headers({ Prefer: "count=exact" }) });
  const cr = r.headers.get("content-range") ?? "";
  return Number(cr.split("/")[1]);
}

const report = [];
for (const m of man.sort((a, b) => a.bytes - b.bytes)) {
  const t = m.table;
  if (only && !only.has(t)) continue;
  const cols = schema[t];
  const text = fs.readFileSync(`copy/${m.name}.copy`, "utf8");
  const lines = text.split("\n").filter((l) => l.length && l !== "\\.");
  const size = BATCH[t] ?? 500;
  let sent = 0;
  for (let i = 0; i < lines.length; i += size) {
    const rows = lines.slice(i, i + size).map((line) => {
      const f = line.split("\t");
      if (f.length !== cols.length) throw new Error(`${t}: linha com ${f.length} campos, esperado ${cols.length}`);
      const o = {};
      cols.forEach((c, k) => { o[c.name] = convert(c.type, unescapeCopy(f[k])); });
      if (t === "store_settings") o.user_id = null; // usuário do banco antigo não existe no destino
      return o;
    });
    if (!process.env.DRY) await post(t, rows);
    sent += rows.length;
  }
  const dest = process.env.DRY ? lines.length : await destCount(t);
  const ok = dest === lines.length;
  report.push({ t, origem: lines.length, enviadas: sent, destino: dest, ok });
  console.log(`${ok ? "OK " : "DIF"} ${t}: origem ${lines.length} | destino ${dest}`);
}
const bad = report.filter((r) => !r.ok);
console.log(bad.length ? `ATENÇÃO: ${bad.length} tabela(s) com diferença` : "TODAS AS TABELAS CONFEREM");
fs.writeFileSync("load-report.json", JSON.stringify(report, null, 1));
