import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

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
    itens: { titulo: string; descricao: string }[];
  };
  comoFunciona: {
    seloTexto: string;
    passos: { titulo: string; descricao: string }[];
    imagemUrl: string;
    imagemLegenda: string;
    numeroGrande: string;
    numeroGrandeLabel: string;
    logoTexto: string;
    headline: string;
    ctaLabel: string;
    ctaUrl: string;
  };
  rodape: {
    linhaEndereco: string;
    linhaBadges: string;
    textoLegal: string;
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
    numeroGrande: "",
    numeroGrandeLabel: "",
    logoTexto: "MANIA DE MULHER",
    headline: "Uma frase de fechamento para reforçar a marca.",
    ctaLabel: "GARANTIR MINHA OFERTA",
    ctaUrl: "",
  },
  rodape: {
    linhaEndereco: "MANIA DE MULHER · BELO HORIZONTE, MG",
    linhaBadges: "TROCA FÁCIL · 4X SEM JUROS · BRINDE EM TODAS AS COMPRAS",
    textoLegal: "Condições da oferta e regulamento completo.",
  },
};

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
    itens: z.array(z.object({ titulo: z.string(), descricao: z.string() })),
  }),
  comoFunciona: z.object({
    seloTexto: z.string(),
    passos: z.array(z.object({ titulo: z.string(), descricao: z.string() })),
    imagemUrl: z.string(),
    imagemLegenda: z.string(),
    numeroGrande: z.string(),
    numeroGrandeLabel: z.string(),
    logoTexto: z.string(),
    headline: z.string(),
    ctaLabel: z.string(),
    ctaUrl: z.string(),
  }),
  rodape: z.object({
    linhaEndereco: z.string(),
    linhaBadges: z.string(),
    textoLegal: z.string(),
  }),
});

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const landingPageSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).regex(SLUG_RE, "Use só letras minúsculas, números e hífen."),
  nome: z.string().min(1),
  status: z.enum(["rascunho", "publicada"]),
  conteudo: contentSchema,
});

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
    return page as LandingPage | null;
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
    return { id: (created as { id: string }).id };
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
    return { id: (created as { id: string }).id };
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
    return p;
  });
