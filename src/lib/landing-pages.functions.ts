import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Upload de imagem do editor de landing pages — mesmo padrão de uploadEnvioMedia/flow.server.ts
 *  (base64 do cliente, bucket público, devolve a URL pública direto). */
export const uploadLandingPageImage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ fileName: z.string().min(1), base64Data: z.string().min(1), contentType: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${safeName}`;
    const bytes = base64ToUint8Array(data.base64Data);
    const { error } = await supabaseAdmin.storage.from("landing-uploads").upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: publicUrl } = supabaseAdmin.storage.from("landing-uploads").getPublicUrl(path);
    return { url: publicUrl.publicUrl };
  });

/** Cada imagem escolhe sua própria proporção — "original" evita cortar cartazes/artes com texto
 *  desenhado neles (a única forma de nunca perder informação sem a usuária ter que redimensionar
 *  o arquivo antes de subir). */
export const IMAGE_ASPECT_OPTIONS = ["quadrada", "retrato", "paisagem", "original"] as const;
export type ImageAspect = (typeof IMAGE_ASPECT_OPTIONS)[number];

/** Estrutura fixa reaproveitada de https://14anos.maniadmulher.com/ — cada landing page criada
 *  aqui preenche o mesmo layout (barra de anúncio, hero, bloco de desconto, benefícios, "como
 *  funciona", fechamento e rodapé) com conteúdo/cores próprios, em vez de um construtor livre. */
export type LandingPageContent = {
  ticker: string[];
  tema: {
    corPrimaria: string;
    corDestaque: string;
    corFundo: string;
    corDourada: string;
  };
  hero: {
    logoTexto: string;
    selo: string;
    headlineNormal: string;
    headlineDestaque: string;
    subcopy: string;
    ctaLabel: string;
    ctaUrl: string;
    ctaLegenda: string;
    imagemUrl: string;
    imagemLegenda: string;
    imagemProporcao: ImageAspect;
  };
  estatisticas: {
    seloTexto: string;
    tituloTexto: string;
    item1Label: string;
    item1Valor: string;
    item2Label: string;
    item2Valor: string;
    totalValor: string;
    totalLabel: string;
  };
  beneficios: {
    seloTexto: string;
    imagemUrl: string;
    imagemLegenda: string;
    imagemProporcao: ImageAspect;
    itens: { titulo: string; descricao: string }[];
  };
  comoFunciona: {
    seloTexto: string;
    passos: { titulo: string; descricao: string }[];
    imagemUrl: string;
    imagemLegenda: string;
    imagemProporcao: ImageAspect;
    numeroGrande: string;
    numeroGrandeLabel: string;
    logoTexto: string;
    headline: string;
    ctaLabel: string;
    ctaUrl: string;
  };
  depoimentos: {
    seloTexto: string;
    itens: { nome: string; texto: string; estrelas: number }[];
  };
  rodape: {
    linhaEndereco: string;
    linhaBadges: string;
    textoLegal: string;
  };
  /** Blocos opcionais que a usuária pode ligar/desligar por campanha — hero, ticker e rodapé
   *  ficam de fora por serem a estrutura mínima da página. */
  secoesVisiveis: {
    estatisticas: boolean;
    beneficios: boolean;
    comoFunciona: boolean;
    depoimentos: boolean;
  };
  /** Cada landing page pode rodar numa conta de anúncio diferente, então o Pixel do Meta é
   *  configurado por página (não global) — dispara PageView no load e Lead quando a cliente
   *  envia o telefone, pra alimentar remarketing/lookalike dessa campanha específica. */
  integracoes: {
    metaPixelId: string;
    /** Grupo acompanhado por esta pagina. O id pertence a fe_groups no Live Launchpad. */
    whatsappGroupId: string;
  };
};

export type LandingPage = {
  id: string;
  slug: string;
  nome: string;
  status: "rascunho" | "publicada";
  conteudo: LandingPageContent;
  criado_em: string;
  atualizado_em: string;
};

export const DEFAULT_LANDING_PAGE_CONTENT: LandingPageContent = {
  ticker: ["DESCONTO ESPECIAL", "OFERTA POR TEMPO LIMITADO", "APROVEITE AGORA"],
  tema: { corPrimaria: "#E85D8A", corDestaque: "#4A1D2E", corFundo: "#FBF3F0", corDourada: "#C9A15A" },
  hero: {
    logoTexto: "MANIA DE MULHER",
    selo: "OFERTA ESPECIAL",
    headlineNormal: "Uma oferta especial para quem",
    headlineDestaque: "quer aproveitar duas vezes",
    subcopy: "Descreva aqui a oferta em uma ou duas frases.",
    ctaLabel: "QUERO APROVEITAR",
    ctaUrl: "",
    ctaLegenda: "Sem compromisso. Leva poucos segundos.",
    imagemUrl: "",
    imagemLegenda: "",
    imagemProporcao: "retrato",
  },
  estatisticas: {
    seloTexto: "A OFERTA",
    tituloTexto: "Desconto duplo na mesma compra",
    item1Label: "primeiro desconto",
    item1Valor: "10%",
    item2Label: "segundo desconto",
    item2Valor: "10%",
    totalValor: "até 20%",
    totalLabel: "DE DESCONTO",
  },
  beneficios: {
    seloTexto: "VANTAGENS",
    imagemUrl: "",
    imagemLegenda: "",
    imagemProporcao: "original",
    itens: [
      { titulo: "Vantagem 1", descricao: "Descreva a primeira vantagem." },
      { titulo: "Vantagem 2", descricao: "Descreva a segunda vantagem." },
      { titulo: "Vantagem 3", descricao: "Descreva a terceira vantagem." },
    ],
  },
  comoFunciona: {
    seloTexto: "COMO FUNCIONA",
    passos: [
      { titulo: "Passo 1", descricao: "Descreva o primeiro passo." },
      { titulo: "Passo 2", descricao: "Descreva o segundo passo." },
      { titulo: "Passo 3", descricao: "Descreva o terceiro passo." },
    ],
    imagemUrl: "",
    imagemLegenda: "",
    imagemProporcao: "retrato",
    numeroGrande: "",
    numeroGrandeLabel: "",
    logoTexto: "MANIA DE MULHER",
    headline: "Uma frase de fechamento para reforçar a marca.",
    ctaLabel: "GARANTIR MINHA OFERTA",
    ctaUrl: "",
  },
  depoimentos: {
    seloTexto: "O QUE AS CLIENTES DIZEM",
    itens: [
      { nome: "Juliana R.", texto: "Chegou rapidinho e é ainda mais linda pessoalmente. Já virei cliente fiel!", estrelas: 5 },
      { nome: "Camila S.", texto: "Atendimento excelente e o desconto valeu muito a pena. Recomendo demais.", estrelas: 5 },
      { nome: "Fernanda A.", texto: "Adorei o presente que veio junto no pedido. Superou minhas expectativas.", estrelas: 5 },
    ],
  },
  rodape: {
    linhaEndereco: "MANIA DE MULHER · BELO HORIZONTE, MG",
    linhaBadges: "TROCA FÁCIL · 4X SEM JUROS · BRINDE EM TODAS AS COMPRAS",
    textoLegal: "Condições da oferta e regulamento completo.",
  },
  secoesVisiveis: { estatisticas: true, beneficios: true, comoFunciona: true, depoimentos: true },
  integracoes: { metaPixelId: "", whatsappGroupId: "" },
};

/** Landing pages salvas antes da última seção nova (ex.: "depoimentos") têm esse campo ausente
 *  no JSON gravado — sem esse merge por seção, a página quebraria ao tentar ler
 *  `conteudo.depoimentos.itens` de um objeto que nunca teve essa chave. */
export function mergeWithDefaultContent(saved: Partial<LandingPageContent> | null | undefined): LandingPageContent {
  const s = saved ?? {};
  return {
    ticker: s.ticker ?? DEFAULT_LANDING_PAGE_CONTENT.ticker,
    tema: { ...DEFAULT_LANDING_PAGE_CONTENT.tema, ...s.tema },
    hero: { ...DEFAULT_LANDING_PAGE_CONTENT.hero, ...s.hero },
    estatisticas: { ...DEFAULT_LANDING_PAGE_CONTENT.estatisticas, ...s.estatisticas },
    beneficios: { ...DEFAULT_LANDING_PAGE_CONTENT.beneficios, ...s.beneficios },
    comoFunciona: { ...DEFAULT_LANDING_PAGE_CONTENT.comoFunciona, ...s.comoFunciona },
    depoimentos: { ...DEFAULT_LANDING_PAGE_CONTENT.depoimentos, ...s.depoimentos },
    rodape: { ...DEFAULT_LANDING_PAGE_CONTENT.rodape, ...s.rodape },
    secoesVisiveis: { ...DEFAULT_LANDING_PAGE_CONTENT.secoesVisiveis, ...s.secoesVisiveis },
    integracoes: { ...DEFAULT_LANDING_PAGE_CONTENT.integracoes, ...s.integracoes },
  };
}

const imageAspectSchema = z.enum(IMAGE_ASPECT_OPTIONS);

const contentSchema: z.ZodType<LandingPageContent> = z.object({
  ticker: z.array(z.string()),
  tema: z.object({
    corPrimaria: z.string(),
    corDestaque: z.string(),
    corFundo: z.string(),
    corDourada: z.string(),
  }),
  hero: z.object({
    logoTexto: z.string(),
    selo: z.string(),
    headlineNormal: z.string(),
    headlineDestaque: z.string(),
    subcopy: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
    ctaLegenda: z.string(),
    imagemUrl: z.string(),
    imagemLegenda: z.string(),
    imagemProporcao: imageAspectSchema,
  }),
  estatisticas: z.object({
    seloTexto: z.string(),
    tituloTexto: z.string(),
    item1Label: z.string(),
    item1Valor: z.string(),
    item2Label: z.string(),
    item2Valor: z.string(),
    totalValor: z.string(),
    totalLabel: z.string(),
  }),
  beneficios: z.object({
    seloTexto: z.string(),
    imagemUrl: z.string(),
    imagemLegenda: z.string(),
    imagemProporcao: imageAspectSchema,
    itens: z.array(z.object({ titulo: z.string(), descricao: z.string() })),
  }),
  comoFunciona: z.object({
    seloTexto: z.string(),
    passos: z.array(z.object({ titulo: z.string(), descricao: z.string() })),
    imagemUrl: z.string(),
    imagemLegenda: z.string(),
    imagemProporcao: imageAspectSchema,
    numeroGrande: z.string(),
    numeroGrandeLabel: z.string(),
    logoTexto: z.string(),
    headline: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
  }),
  depoimentos: z.object({
    seloTexto: z.string(),
    itens: z.array(z.object({ nome: z.string(), texto: z.string(), estrelas: z.number().int().min(1).max(5) })),
  }),
  rodape: z.object({
    linhaEndereco: z.string(),
    linhaBadges: z.string(),
    textoLegal: z.string(),
  }),
  secoesVisiveis: z.object({
    estatisticas: z.boolean(),
    beneficios: z.boolean(),
    comoFunciona: z.boolean(),
    depoimentos: z.boolean(),
  }),
  integracoes: z.object({
    metaPixelId: z.string(),
    whatsappGroupId: z.string(),
  }),
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const landingPageSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).regex(SLUG_RE, "Use só letras minúsculas, números e hífen."),
  nome: z.string().min(1),
  status: z.enum(["rascunho", "publicada"]),
  /** Preenche com os defaults antes de validar — uma aba do editor aberta desde antes do último
   *  deploy ainda roda o JS antigo e não manda as seções mais novas (ex.: "integracoes"); sem
   *  esse merge, salvar de uma aba assim quebraria com "Required" em vez de simplesmente usar o
   *  padrão pra essas seções. */
  conteudo: z.preprocess((val) => mergeWithDefaultContent(val as Partial<LandingPageContent> | null | undefined), contentSchema),
});

type LandingPageSegmentKind = "submitted_not_joined" | "clicked_not_joined";

function landingPageSegmentDescription(landingPageId: string, kind: LandingPageSegmentKind): string {
  return `[landing-page:${landingPageId}:${kind}] Segmento gerado automaticamente.`;
}

function landingPageSegmentRules(landingPageId: string, kind: LandingPageSegmentKind) {
  const suffix = kind.replaceAll("_", "-");
  return {
    groups: [
      {
        id: `landing-page-${landingPageId}-${suffix}`,
        type: "AND",
        conditions: [
          {
            id: `landing-page-${landingPageId}-${suffix}-condition`,
            category: "marketing",
            field: "landing_page",
            label: "Landing Page",
            operator: kind,
            value: landingPageId,
          },
        ],
      },
    ],
    excludeGroups: [],
  };
}

/** Mantem os dois segmentos pedidos pelo funil: o publico amplo (preencheu/nao entrou) e o
 *  publico estrito que pode receber a recuperacao (clicou/nao entrou). */
async function ensureLandingPageSegments(
  supabaseAdmin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  page: { id: string; nome: string },
): Promise<{ submittedSegmentId: string; clickedSegmentId: string }> {
  const definitions: Array<{ kind: LandingPageSegmentKind; nome: string }> = [
    { kind: "submitted_not_joined", nome: `LP · ${page.nome} · Preencheu e não entrou` },
    { kind: "clicked_not_joined", nome: `LP · ${page.nome} · Clicou e não entrou` },
  ];
  const ids = new Map<LandingPageSegmentKind, string>();

  for (const definition of definitions) {
    const descricao = landingPageSegmentDescription(page.id, definition.kind);
    const { data: existing, error: findError } = await supabaseAdmin
      .from("crm_segments")
      .select("id")
      .eq("descricao", descricao)
      .maybeSingle();
    if (findError) throw new Error(`Não foi possível localizar o segmento da landing page: ${findError.message}`);

    const payload = {
      nome: definition.nome,
      descricao,
      regras: landingPageSegmentRules(page.id, definition.kind),
      atualizado_em: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supabaseAdmin.from("crm_segments").update(payload as never).eq("id", existing.id);
      if (error) throw new Error(`Não foi possível atualizar o segmento da landing page: ${error.message}`);
      ids.set(definition.kind, existing.id);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("crm_segments")
        .insert({ ...payload, criado_em: new Date().toISOString() } as never)
        .select("id")
        .single();
      if (error || !created) throw new Error(`Não foi possível criar o segmento da landing page: ${error?.message ?? "sem retorno"}`);
      ids.set(definition.kind, created.id);
    }
  }

  return {
    submittedSegmentId: ids.get("submitted_not_joined")!,
    clickedSegmentId: ids.get("clicked_not_joined")!,
  };
}

export const listLandingPages = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("landing_pages")
      .select("id, slug, nome, status, criado_em, atualizado_em")
      .order("criado_em", { ascending: false });
    if (error) throw error;
    return data as Omit<LandingPage, "conteudo">[];
  });

export const getLandingPage = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin.from("landing_pages").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!page) return null;
    const p = page as LandingPage;
    return { ...p, conteudo: mergeWithDefaultContent(p.conteudo) };
  });

export const saveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => landingPageSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const payload = { ...rest, atualizado_em: new Date().toISOString() };

    if (id) {
      const { error } = await (supabaseAdmin.from("landing_pages") as any).update(payload).eq("id", id);
      if (error) {
        if ((error as any).code === "23505") throw new Error("Já existe uma landing page com esse link (slug).");
        throw error;
      }
      await ensureLandingPageSegments(supabaseAdmin, { id, nome: data.nome });
      return { id };
    }
    const { data: created, error } = await (supabaseAdmin.from("landing_pages") as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      if ((error as any).code === "23505") throw new Error("Já existe uma landing page com esse link (slug).");
      throw error;
    }
    const createdId = (created as { id: string }).id;
    await ensureLandingPageSegments(supabaseAdmin, { id: createdId, nome: data.nome });
    return { id: createdId };
  });

export const toggleLandingPageStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["rascunho", "publicada"]) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("landing_pages") as any)
      .update({ status: data.status, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("landing_pages").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true };
  });

export const duplicateLandingPage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: original, error } = await supabaseAdmin.from("landing_pages").select("*").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!original) throw new Error("Landing page não encontrada.");
    const source = original as LandingPage;

    let slug = `${source.slug}-copia`;
    for (let attempt = 2; ; attempt++) {
      const { data: existing } = await supabaseAdmin.from("landing_pages").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${source.slug}-copia-${attempt}`;
    }

    const { data: created, error: insertError } = await (supabaseAdmin.from("landing_pages") as any)
      .insert({ slug, nome: `${source.nome} (cópia)`, status: "rascunho", conteudo: source.conteudo })
      .select("id")
      .single();
    if (insertError) throw insertError;
    const createdId = (created as { id: string }).id;
    await ensureLandingPageSegments(supabaseAdmin, { id: createdId, nome: `${source.nome} (cópia)` });
    return { id: createdId };
  });

// --- Público (sem autenticação): a página que roda nos anúncios ---

export const getPublicLandingPage = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin
      .from("landing_pages")
      .select("slug, nome, status, conteudo")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw error;
    const p = page as Pick<LandingPage, "slug" | "nome" | "status" | "conteudo"> | null;
    if (!p || p.status !== "publicada") return null;
    return { ...p, conteudo: mergeWithDefaultContent(p.conteudo) };
  });

const visitorIdSchema = z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/).optional();

/** PageView proprio do CRM. O Pixel continua recebendo o evento dele, mas o funil nao depende
 *  de cookies da Meta e consegue contar visitantes unicos pelo identificador local do navegador. */
export const trackLandingPageView = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ slug: z.string().min(1), visitorId: visitorIdSchema }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error: pageError } = await supabaseAdmin
      .from("landing_pages")
      .select("id, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (pageError) throw pageError;
    if (!page || page.status !== "publicada") return { success: false as const };

    const { error } = await (supabaseAdmin.from("landing_page_events" as any) as any).insert({
      landing_page_id: page.id,
      event_type: "view",
      visitor_id: data.visitorId ?? null,
    });
    if (error) throw error;
    return { success: true as const };
  });

function brazilianPhoneVariants(phone: string): string[] {
  const variants = new Set([phone]);
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) {
    const local = digits.slice(2);
    if (local.length === 11 && local[2] === "9") variants.add(`+55${local.slice(0, 2)}${local.slice(3)}`);
    if (local.length === 10) variants.add(`+55${local.slice(0, 2)}9${local.slice(2)}`);
  }
  return [...variants];
}

async function upsertLandingPageCRMContact(
  supabaseAdmin: (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"],
  phone: string,
  slug: string,
): Promise<string> {
  const variants = brazilianPhoneVariants(phone);
  const { data: matches, error: findError } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, tags_custom")
    .in("phone", variants)
    .limit(1);
  if (findError) throw new Error(`Não foi possível localizar o contato no CRM: ${findError.message}`);
  const existing = matches?.[0] as { id: string; tags_custom: string[] | null } | undefined;
  const now = new Date().toISOString();

  if (existing) {
    const tags = Array.from(new Set([...(existing.tags_custom ?? []), slug]));
    const { error } = await supabaseAdmin
      .from("shopify_customers")
      .update({ tags_custom: tags, updated_at: now } as never)
      .eq("id", existing.id);
    if (error) throw new Error(`Não foi possível adicionar a tag da landing page ao contato: ${error.message}`);
    return existing.id;
  }

  const customerId = `phone:${phone}`;
  const { error } = await supabaseAdmin.from("shopify_customers").upsert(
    {
      id: customerId,
      phone,
      tags_custom: [slug],
      created_at: now,
      updated_at: now,
    } as never,
    { onConflict: "id" },
  );
  if (error) throw new Error(`Não foi possível criar o contato no CRM: ${error.message}`);
  return customerId;
}

/** Captura o formulario, cria/atualiza o contato no CRM com a tag do slug e registra as etapas
 *  formulario + clique. O mesmo telefone nao gera uma nova ficha no CRM. */
export const submitLandingPageLead = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ slug: z.string().min(1), phone: z.string().min(8), visitorId: visitorIdSchema }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeShopifyPhone } = await import("./shopify-order-phone");
    const phone = normalizeShopifyPhone(data.phone);
    if (!phone) return { success: false as const, error: "Telefone inválido." };

    const { data: page, error: pageError } = await supabaseAdmin
      .from("landing_pages")
      .select("id, slug, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (pageError) throw pageError;
    const p = page as { id: string; slug: string; status: string } | null;
    if (!p || p.status !== "publicada") return { success: false as const, error: "Página não encontrada." };

    // Registra primeiro a captura da landing page. A ficha no CRM é uma consequência desse
    // evento, não a fonte de verdade. Assim, uma falha no CRM não deixa um contato "órfão"
    // apenas com a tag e invisível em Contatos/Relatórios.
    const clickedAt = new Date().toISOString();
    const { data: existingLeads, error: existingError } = await (supabaseAdmin.from("landing_page_leads") as any)
      .select("id")
      .eq("landing_page_id", p.id)
      .in("phone", brazilianPhoneVariants(phone))
      .order("criado_em", { ascending: true })
      .limit(1);
    if (existingError) throw existingError;

    let leadId: string;
    const existingLead = (existingLeads ?? [])[0] as { id: string } | undefined;
    if (existingLead) {
      const { error } = await (supabaseAdmin.from("landing_page_leads") as any)
        .update({ visitor_id: data.visitorId ?? null, clicked_at: clickedAt })
        .eq("id", existingLead.id);
      if (error) throw error;
      leadId = existingLead.id;
    } else {
      const { data: created, error } = await (supabaseAdmin.from("landing_page_leads") as any)
        .insert({
          landing_page_id: p.id,
          phone,
          visitor_id: data.visitorId ?? null,
          clicked_at: clickedAt,
        })
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error("Contato da landing page não foi retornado.");
      leadId = String(created.id);
    }

    const eventRows = ["form_submit", "link_click"].map((eventType) => ({
      landing_page_id: p.id,
      event_type: eventType,
      visitor_id: data.visitorId ?? null,
      lead_id: leadId,
      customer_id: null,
      phone,
    }));
    const { error: eventError } = await (supabaseAdmin.from("landing_page_events" as any) as any).insert(eventRows);
    if (eventError) throw eventError;

    // Só depois da captura estar persistida, vincula o contato ao CRM. Se o CRM falhar,
    // a captura e os eventos continuam disponíveis para o relatório.
    const customerId = await upsertLandingPageCRMContact(supabaseAdmin, phone, p.slug);
    const { error: leadLinkError } = await (supabaseAdmin.from("landing_page_leads") as any)
      .update({ customer_id: customerId })
      .eq("id", leadId);
    if (leadLinkError) throw leadLinkError;
    const { error: eventLinkError } = await (supabaseAdmin.from("landing_page_events" as any) as any)
      .update({ customer_id: customerId })
      .eq("lead_id", leadId);
    if (eventLinkError) throw eventLinkError;

    return { success: true as const, leadId, customerId };
  });

/** Comentários aprovados pra exibir junto com os depoimentos fixos (fake) do conteúdo. */
export const getPublicLandingPageReviews = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ slug: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page } = await supabaseAdmin.from("landing_pages").select("id").eq("slug", data.slug).maybeSingle();
    const p = page as { id: string } | null;
    if (!p) return [];
    const { data: reviews, error } = await supabaseAdmin
      .from("landing_page_reviews")
      .select("id, nome, texto, estrelas, criado_em")
      .eq("landing_page_id", p.id)
      .eq("aprovado", true)
      .order("criado_em", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (reviews ?? []) as { id: string; nome: string; texto: string; estrelas: number; criado_em: string }[];
  });

/** Comentário enviado por uma cliente real na landing page — fica pendente até alguém aprovar
 *  no admin, pra não publicar spam/ofensas direto na página pública. */
export const submitLandingPageReview = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      slug: z.string().min(1),
      nome: z.string().trim().min(1).max(80),
      texto: z.string().trim().min(1).max(500),
      estrelas: z.number().int().min(1).max(5),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error: pageError } = await supabaseAdmin
      .from("landing_pages")
      .select("id, status")
      .eq("slug", data.slug)
      .maybeSingle();
    if (pageError) throw pageError;
    const p = page as { id: string; status: string } | null;
    if (!p || p.status !== "publicada") return { success: false as const, error: "Página não encontrada." };

    const { error } = await (supabaseAdmin.from("landing_page_reviews") as any).insert({
      landing_page_id: p.id,
      nome: data.nome,
      texto: data.texto,
      estrelas: data.estrelas,
      aprovado: false,
    });
    if (error) throw error;
    return { success: true as const };
  });

// --- Admin: moderação de comentários ---

export const listLandingPageReviews = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ landingPageId: z.string().uuid().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("landing_page_reviews")
      .select("id, nome, texto, estrelas, aprovado, criado_em, landing_page_id, landing_pages(nome)")
      .order("criado_em", { ascending: false })
      .limit(1000);
    if (data.landingPageId) query = query.eq("landing_page_id", data.landingPageId);
    const { data: reviews, error } = await query;
    if (error) throw error;
    return ((reviews ?? []) as any[]).map((r) => ({
      id: r.id as string,
      nome: r.nome as string,
      texto: r.texto as string,
      estrelas: r.estrelas as number,
      aprovado: r.aprovado as boolean,
      criadoEm: r.criado_em as string,
      landingPageId: r.landing_page_id as string,
      landingPageNome: (r.landing_pages?.nome ?? "—") as string,
    }));
  });

export const moderateLandingPageReview = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), aprovado: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("landing_page_reviews") as any).update({ aprovado: data.aprovado }).eq("id", data.id);
    if (error) throw error;
    return { success: true as const };
  });

export const deleteLandingPageReview = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("landing_page_reviews").delete().eq("id", data.id);
    if (error) throw error;
    return { success: true as const };
  });

// --- Admin: contatos capturados + funil ---

export const listLandingPageLeads = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ landingPageId: z.string().uuid().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ loadResolvedLandingPages, loadLandingPageGroupJoins }, { landingPagePhoneKey }] = await Promise.all([
      import("./landing-page-funnel.server"),
      import("./landing-page-funnel"),
    ]);
    let query = (supabaseAdmin.from("landing_page_leads") as any)
      .select("id, phone, customer_id, criado_em, clicked_at, landing_page_id, landing_pages(nome, slug)")
      .order("criado_em", { ascending: false })
      .limit(20000);
    if (data.landingPageId) query = query.eq("landing_page_id", data.landingPageId);
    const { data: leads, error } = await query;
    if (error) throw error;

    const pages = await loadResolvedLandingPages(data.landingPageId);
    const leadPhones = Array.from(
      new Set(
        ((leads ?? []) as any[])
          .map((lead) => String(lead.phone ?? "").trim())
          .filter(Boolean),
      ),
    );
    const joins = await loadLandingPageGroupJoins(pages, { phones: leadPhones });
    const joinByPagePhone = new Map<string, (typeof joins)[number]>();
    for (const join of joins) {
      const key = `${join.landingPageId}|${landingPagePhoneKey(join.phone)}`;
      const current = joinByPagePhone.get(key);
      if (!current || join.joinedAt < current.joinedAt) joinByPagePhone.set(key, join);
    }

    // Leads antigos podiam repetir a mesma pessoa. A tela e o funil trabalham sempre com
    // contato unico por landing page, sem apagar o historico bruto.
    const unique = new Map<string, any>();
    for (const lead of (leads ?? []) as any[]) {
      const key = `${lead.landing_page_id}|${landingPagePhoneKey(lead.phone)}`;
      if (!unique.has(key)) unique.set(key, lead);
    }

    return [...unique.values()].map((lead) => {
      const join = joinByPagePhone.get(`${lead.landing_page_id}|${landingPagePhoneKey(lead.phone)}`);
      return {
        id: lead.id as string,
        phone: lead.phone as string,
        customerId: (lead.customer_id ?? null) as string | null,
        criadoEm: lead.criado_em as string,
        clicouEm: (lead.clicked_at ?? lead.criado_em) as string,
        landingPageId: lead.landing_page_id as string,
        landingPageNome: (lead.landing_pages?.nome ?? "—") as string,
        landingPageSlug: (lead.landing_pages?.slug ?? "") as string,
        entrouNoGrupo: Boolean(join),
        grupoNome: join?.groupName ?? null,
        entrouEm: join?.joinedAt ?? null,
      };
    });
  });

export type LandingPageReportPeriod = "7d" | "30d" | "90d" | "all";

function landingPageReportStart(period: LandingPageReportPeriod): string | undefined {
  if (period === "all") return undefined;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const getLandingPageFunnelReport = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ landingPageId: z.string().uuid().optional(), period: z.enum(["7d", "30d", "90d", "all"]).default("30d") }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ loadResolvedLandingPages, loadLandingPageGroupJoins }, { computeLandingPageFunnel, computeLandingPageDailyJoins, landingPagePhoneKey }] = await Promise.all([
      import("./landing-page-funnel.server"),
      import("./landing-page-funnel"),
    ]);
    let pages: Awaited<ReturnType<typeof loadResolvedLandingPages>>;
    let groupEnrichmentAvailable = true;
    try {
      pages = await loadResolvedLandingPages(data.landingPageId);
    } catch (error) {
      groupEnrichmentAvailable = false;
      console.warn("Landing reports: group enrichment unavailable; reporting page events without joins.", error);
      const { data: pageRows, error: pageError } = await supabaseAdmin.from("landing_pages").select("id, nome, slug").order("criado_em", { ascending: false });
      if (pageError) throw pageError;
      pages = ((pageRows ?? []) as Array<{ id: string; nome: string; slug: string }>).map((page) => ({
        id: page.id,
        nome: page.nome,
        slug: page.slug,
        groupId: null,
        groupName: null,
        groupInviteLink: null,
        groupJid: null,
        equivalentGroupIds: [],
        currentParticipantPhones: [],
      }));
      if (data.landingPageId) pages = pages.filter((page) => page.id === data.landingPageId);
    }

    const since = landingPageReportStart(data.period);

    // O funil e montado a partir de landing_page_events + entradas no grupo (que vivem em outro
    // banco), entao nao ha agregacao possivel num unico RPC.

    const events: any[] = [];
    let eventStoreAvailable = true;
    try {
      for (let page = 0; ; page++) {
        let query = (supabaseAdmin.from("landing_page_events" as any) as any).select("id, landing_page_id, event_type, visitor_id, phone, criado_em").order("criado_em", { ascending: true }).range(page * 1000, page * 1000 + 999);
        if (data.landingPageId) query = query.eq("landing_page_id", data.landingPageId);
        if (since) query = query.gte("criado_em", since);
        const { data: rows, error } = await query;
        if (error) throw error;
        events.push(...(rows ?? []));
        if ((rows ?? []).length < 1000) break;
      }
    } catch (error) {
      eventStoreAvailable = false;
      console.warn("Landing reports: event store unavailable; falling back to landing_page_leads.", error);
      let query = (supabaseAdmin.from("landing_page_leads" as any).select("id, landing_page_id, phone, criado_em, visitor_id, customer_id, clicked_at").order("criado_em", { ascending: true }).range(0, 19999) as any);
      if (data.landingPageId) query = query.eq("landing_page_id", data.landingPageId);
      if (since) query = query.gte("criado_em", since);
      const { data: leads, error: leadsError } = await query;
      if (leadsError) throw leadsError;
      for (const lead of (leads ?? []) as any[]) {
        events.push(
          { id: String(lead.id) + ":form_submit", landing_page_id: lead.landing_page_id, event_type: "form_submit", visitor_id: lead.visitor_id ?? null, phone: lead.phone ?? null, criado_em: lead.criado_em },
          { id: String(lead.id) + ":link_click", landing_page_id: lead.landing_page_id, event_type: "link_click", visitor_id: lead.visitor_id ?? null, phone: lead.phone ?? null, criado_em: lead.clicked_at ?? lead.criado_em },
        );
      }
    }
    let joins: Awaited<ReturnType<typeof loadLandingPageGroupJoins>> = [];
    if (groupEnrichmentAvailable && pages.some((page) => page.groupId)) {
      try {
        joins = await loadLandingPageGroupJoins(pages, since ? { since } : undefined);
      } catch (error) {
        groupEnrichmentAvailable = false;
        console.warn("Landing reports: WhatsApp join enrichment unavailable; continuing without joins.", error);
      }
    }
    const pageById = new Map(pages.map((page) => [page.id, page]));
    const clickedPhonesByPage = new Map<string, Set<string>>();
    for (const event of events) {
      if (event.event_type !== "link_click") continue;
      const phoneKey = landingPagePhoneKey(event.phone);
      if (!phoneKey) continue;
      const phones = clickedPhonesByPage.get(event.landing_page_id) ?? new Set<string>();
      phones.add(phoneKey);
      clickedPhonesByPage.set(event.landing_page_id, phones);
    }
    const normalizedEvents = events.map((event) => ({ id: String(event.id), landingPageId: String(event.landing_page_id), eventType: event.event_type, visitorId: event.visitor_id ?? null, phone: event.phone ?? null, createdAt: event.criado_em }));
    const report = computeLandingPageFunnel(pages.map((page) => ({ ...page })), normalizedEvents, joins);
    const dailyJoins = computeLandingPageDailyJoins(pages.map((page) => ({ ...page })), normalizedEvents, joins);
    return {
      ...report,
      period: data.period,
      dailyJoins,
      recentGroupEntries: joins
        .slice()
        .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
        .slice(0, 100)
        .map((join) => ({
          phone: join.phone,
          landingPageId: join.landingPageId,
          landingPageName: pageById.get(join.landingPageId)?.nome ?? "—",
          groupId: join.groupId,
          groupName: join.groupName,
          joinedAt: join.joinedAt,
          detectionSource: join.detectionSource ?? "event",
          isLandingContact: Boolean(
            clickedPhonesByPage.get(join.landingPageId)?.has(landingPagePhoneKey(join.phone)),
          ),
        })),
      pagesWithoutGroup: pages.filter((page) => !page.groupId).map((page) => ({ id: page.id, nome: page.nome })),
      diagnostics: { eventStoreAvailable, groupEnrichmentAvailable },
    };
  });

/** Garante os segmentos e devolve o publico correto pre-selecionado para abrir o editor da
 *  automacao. A mensagem/template continua sendo escolhida pelo usuario entre os aprovados. */
export const getLandingPageRecoverySetup = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ landingPageId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadResolvedLandingPages } = await import("./landing-page-funnel.server");
    const { data: page, error } = await supabaseAdmin.from("landing_pages").select("id, nome, slug").eq("id", data.landingPageId).maybeSingle();
    if (error) throw error;
    if (!page) throw new Error("Landing page não encontrada.");
    const segments = await ensureLandingPageSegments(supabaseAdmin, page);
    const resolved = (await loadResolvedLandingPages(page.id))[0];
    return {
      landingPageId: page.id,
      nome: page.nome,
      slug: page.slug,
      groupId: resolved?.groupId ?? null,
      groupName: resolved?.groupName ?? null,
      groupInviteLink: resolved?.groupInviteLink ?? null,
      ...segments,
    };
  });
