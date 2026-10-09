import fs from "node:fs"; import zlib from "node:zlib";
const man = JSON.parse(fs.readFileSync("manifest.json","utf8"));
fs.mkdirSync("copy",{recursive:true});
let total=0;
for (const m of man) {
  const z = fs.readFileSync(`raw/${m.name}.zst`);
  const out = z.length ? zlib.zstdDecompressSync(z) : Buffer.alloc(0);
  fs.writeFileSync(`copy/${m.name}.copy`, out);
  m.rows = out.length ? out.toString("utf8").split("\n").filter(l=>l.length && l!=="\.").length : 0;
  m.bytes = out.length; total += m.rows;
}
fs.writeFileSync("manifest.json", JSON.stringify(man));
const pub = man.filter(m=>m.ns==="public").sort((a,b)=>b.bytes-a.bytes);
console.log("total linhas (todas as schemas):", total);
for (const m of pub.slice(0,70)) console.log(`${m.name}: ${m.rows} linhas, ${(m.bytes/1e6).toFixed(1)} MB`);
console.log("--- outras schemas com linhas:");
for (const m of man.filter(m=>m.ns!=="public" && m.rows>0)) console.log(`${m.name}: ${m.rows}`);
