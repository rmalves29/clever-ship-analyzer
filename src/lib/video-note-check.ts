// Vídeo redondo do WhatsApp ("recado de vídeo"): só funciona com vídeo leve em H.264.
// Gravação de iPhone em HEVC (H.265) ou arquivo grande é aceito pela API, mas chega EM BRANCO para quem recebe.
export const VIDEO_NOTE_MAX_MB = 16;

const HEAD_BYTES = 2 * 1024 * 1024;
const TAIL_BYTES = 4 * 1024 * 1024;

async function sliceToLatin1(file: File, start: number, end: number): Promise<string> {
  const buf = await file.slice(start, end).arrayBuffer();
  return new TextDecoder('latin1').decode(buf);
}

// Procura a marca do codec HEVC ("hvc1"/"hev1") no início e no fim do arquivo (onde o MP4/MOV guarda os metadados).
async function looksLikeHevc(file: File): Promise<boolean> {
  try {
    const head = await sliceToLatin1(file, 0, Math.min(file.size, HEAD_BYTES));
    if (head.includes('hvc1') || head.includes('hev1')) return true;
    if (file.size > HEAD_BYTES) {
      const tail = await sliceToLatin1(file, Math.max(HEAD_BYTES, file.size - TAIL_BYTES), file.size);
      if (tail.includes('hvc1') || tail.includes('hev1')) return true;
    }
  } catch {
    /* sem como ler: deixa passar */
  }
  return false;
}

/** Devolve a explicação do problema, ou null se o vídeo parece servir para vídeo redondo. */
export async function checkVideoNoteFile(file: File): Promise<string | null> {
  const mb = file.size / (1024 * 1024);
  if (mb > VIDEO_NOTE_MAX_MB) {
    return `O vídeo tem ${mb.toFixed(0)} MB. O vídeo redondo do WhatsApp aceita até ${VIDEO_NOTE_MAX_MB} MB — senão chega em branco. Reduza o tamanho ou use um vídeo mais curto/em resolução menor.`;
  }
  if (await looksLikeHevc(file)) {
    return 'Este vídeo está em HEVC (H.265, o padrão de gravação do iPhone) e chega em branco no vídeo redondo. Converta para MP4 H.264, de preferência quadrado, ou grave com o iPhone em Ajustes > Câmera > Formatos > "Mais Compatível".';
  }
  return null;
}
