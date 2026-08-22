async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const GATEWAY_UPLOAD = "https://connector-gateway.lovable.dev/google_drive/upload/drive/v3/files";
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_CHUNK_SIZE = 50_000;
const DEFAULT_MAX_CHUNKS = 3;
const DEFAULT_MAX_RUNTIME_MS = 90_000;
const PAGE_SIZE = 1000;

type CleanupOptions = {
  retentionDays?: number;
  folderId?: string;
  dryRun?: boolean;
  chunkSize?: number;
  maxChunks?: number;
  maxRuntimeMs?: number;
};

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Exportador de armazenamento frio: manda linhas antigas de envio_group_events pro Google Drive
 *  (mesmo mecanismo do cleanup-fe-group-events original — só funciona porque o clever-ship-analyzer
 *  também é um projeto Lovable, usa o mesmo connector-gateway). Exige LOVABLE_API_KEY e
 *  GOOGLE_DRIVE_API_KEY configurados como secret neste projeto — sem eles, no-opa silenciosamente. */
export async function runEnvioGroupEventsCleanup(options: CleanupOptions = {}): Promise<{ ranChunks: number; skipped?: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const driveKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableKey || !driveKey) {
    console.log("runEnvioGroupEventsCleanup: LOVABLE_API_KEY/GOOGLE_DRIVE_API_KEY não configurados — pulando.");
    return { ranChunks: 0, skipped: "missing_keys" };
  }

  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const maxRuntimeMs = options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS;
  const dryRun = options.dryRun ?? false;
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();

  const supabaseAdmin = await admin();
  const startedAt = Date.now();
  let ranChunks = 0;

  for (let chunk = 0; chunk < maxChunks; chunk++) {
    if (Date.now() - startedAt > maxRuntimeMs) break;

    const rows: any[] = [];
    let offset = 0;
    while (rows.length < chunkSize) {
      const { data: page, error } = await (supabaseAdmin
        .from("envio_group_events" as any) as any)
        .select("*")
        .lt("created_at", cutoff)
        .order("id", { ascending: true })
        .range(offset, offset + Math.min(PAGE_SIZE, chunkSize - rows.length) - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      rows.push(...page);
      offset += page.length;
      if (page.length < PAGE_SIZE) break;
    }
    if (rows.length === 0) break;

    const chunkStart = Date.now();
    const minId = rows[0].id;
    const maxId = rows[rows.length - 1].id;
    const csv = toCsv(rows);
    const gzipped = await gzip(csv);
    const fileName = `envio_group_events_${new Date().toISOString().slice(0, 10)}_${chunk}.csv.gz`;

    let driveResult: { id: string; name: string; webViewLink?: string; size?: string } | null = null;
    if (!dryRun) {
      const boundary = `----envio-cleanup-${Date.now()}`;
      const metadata = JSON.stringify({ name: fileName, parents: options.folderId ? [options.folderId] : undefined });
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`;
      const bodyBytes = new Uint8Array([
        ...new TextEncoder().encode(body),
        ...gzipped,
        ...new TextEncoder().encode(`\r\n--${boundary}--`),
      ]);

      const res = await fetch(`${GATEWAY_UPLOAD}?uploadType=multipart&fields=id,name,webViewLink,size`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Google-Drive-Key": driveKey,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: bodyBytes,
      });
      if (!res.ok) throw new Error(`Upload pro Google Drive falhou: ${res.status} ${await res.text()}`);
      driveResult = await res.json();
    }

    if (!dryRun) {
      await ((supabaseAdmin.from("envio_group_events" as any) as any) as any).delete().gte("id", minId).lte("id", maxId).lt("created_at", cutoff);
    }

    await ((supabaseAdmin.from("envio_group_events_backups" as any) as any) as any).insert({
      rows_exported: rows.length,
      drive_file_id: driveResult?.id ?? null,
      drive_file_name: driveResult?.name ?? fileName,
      drive_file_url: driveResult?.webViewLink ?? null,
      drive_file_size: driveResult?.size ? Number(driveResult.size) : gzipped.length,
      deleted_rows: dryRun ? 0 : rows.length,
      duration_ms: Date.now() - chunkStart,
      success: true,
      dry_run: dryRun,
    } as never);

    ranChunks++;
  }

  return { ranChunks };
}
