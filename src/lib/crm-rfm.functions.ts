import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export type RFMSegment = 
  | "Campeões"
  | "Leais"
  | "Potencialmente Leais"
  | "Novos"
  | "Precisa de Atenção"
  | "Quase Hibernando"
  | "Em Risco"
  | "Hibernando"
  | "Não pode perder"
  | "Perdidos";

export const RFM_SEGMENTS_CONFIG: Record<RFMSegment, { color: string; description: string }> = {
  "Campeões": { color: "#3b82f6", description: "Comprou recentemente, com frequência e gastou muito." },
  "Leais": { color: "#10b981", description: "Compra com frequência e gasta bem." },
  "Potencialmente Leais": { color: "#84cc16", description: "Clientes recentes com boa frequência e valor médio." },
  "Novos": { color: "#a855f7", description: "Compraram recentemente mas não com frequência." },
  "Precisa de Atenção": { color: "#f59e0b", description: "Recência e frequência acima da média, mas não compraram ultimamente." },
  "Quase Hibernando": { color: "#06b6d4", description: "Recência e frequência abaixo da média. Risco de perda." },
  "Em Risco": { color: "#f97316", description: "Não compram há muito tempo, mas compraram muito no passado." },
  "Hibernando": { color: "#ec4899", description: "Última compra faz muito tempo e poucos pedidos." },
  "Não pode perder": { color: "#ef4444", description: "Compraram muito e com frequência, mas não voltam há tempos." },
  "Perdidos": { color: "#64748b", description: "Scores baixos em todos os critérios." },
};

/**
 * Calcula os scores RFM e atualiza a base de clientes
 */
export const calculateRFMSegments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Buscar todos os pedidos para calcular métricas
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id, total_price, processed_at")
      .neq("financial_status", "VOIDED");

    if (ordersError || !orders) throw new Error("Erro ao buscar pedidos");

    // Agrupar por cliente
    const customerMetrics = new Map<string, {
      recency: number; // dias desde o último pedido
      frequency: number; // total de pedidos
      monetary: number; // LTV
      lastOrderDate: Date;
    }>();

    const now = new Date();

    orders.forEach(o => {
      const cid = o.customer_id;
      if (!cid) return;
      
      const orderDate = new Date(o.processed_at || new Date());
      const metrics = customerMetrics.get(cid) || {
        recency: Infinity,
        frequency: 0,
        monetary: 0,
        lastOrderDate: new Date(0)
      };

      metrics.frequency += 1;
      metrics.monetary += Number(o.total_price || 0);
      if (orderDate > metrics.lastOrderDate) {
        metrics.lastOrderDate = orderDate;
      }
      
      customerMetrics.set(cid, metrics);
    });

    // Calcular recência final
    customerMetrics.forEach(metrics => {
      metrics.recency = Math.floor((now.getTime() - metrics.lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
    });

    // 2. Definir quintis para R, F e M (abordagem padrão RFM)
    const metricsArray = Array.from(customerMetrics.values());
    if (metricsArray.length === 0) return { success: true, count: 0 };

    const getScore = (val: number, sortedArr: number[], reverse = false) => {
      const idx = sortedArr.findIndex(v => v >= val);
      const score = Math.ceil(((idx + 1) / sortedArr.length) * 5);
      return reverse ? 6 - score : score;
    };

    const recencies = metricsArray.map(m => m.recency).sort((a, b) => a - b);
    const frequencies = metricsArray.map(m => m.frequency).sort((a, b) => a - b);
    const monetaries = metricsArray.map(m => m.monetary).sort((a, b) => a - b);

    const updates: any[] = [];

    customerMetrics.forEach((metrics, customerId) => {
      const r = getScore(metrics.recency, recencies, true); // Recência: menor é melhor
      const f = getScore(metrics.frequency, frequencies);
      const m = getScore(metrics.monetary, monetaries);

      let segment: RFMSegment = "Hibernando";

      // Lógica de segmentação baseada na combinação R e F (simplificada)
      if (r >= 4 && f >= 4) segment = "Campeões";
      else if (r >= 3 && f >= 4) segment = "Leais";
      else if (r >= 4 && f >= 2) segment = "Potencialmente Leais";
      else if (r >= 4 && f === 1) segment = "Novos";
      else if (r === 3 && f === 3) segment = "Precisa de Atenção";
      else if (r === 3 && f <= 2) segment = "Quase Hibernando";
      else if (r <= 2 && f >= 4) segment = "Não pode perder";
      else if (r <= 2 && f === 3) segment = "Em Risco";
      else if (r <= 2 && f <= 2) segment = "Hibernando";
      if (r === 1 && f === 1 && m === 1) segment = "Perdidos";

      updates.push({
        id: customerId,
        rfm_segment: segment
      });
    });

    // 3. Atualizar no banco em lotes
    const batchSize = 100;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      await supabaseAdmin
        .from("shopify_customers")
        .upsert(batch);
    }

    return { success: true, count: updates.length };
  });

export const getRFMStats = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: customers, error } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, rfm_segment, tags");

    if (error || !customers) throw new Error("Erro ao buscar clientes");

    const segmentMetrics: Record<string, {
      clientes: number;
      pedidos: number;
      receita: number;
      aov: number;
    }> = {};

    Object.keys(RFM_SEGMENTS_CONFIG).forEach(seg => {
      segmentMetrics[seg] = { clientes: 0, pedidos: 0, receita: 0, aov: 0 };
    });

    const customerToSegment = new Map(customers.map(c => [c.id, c.rfm_segment]));

    // Buscar pedidos para métricas avançadas
    const { data: orders } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id, total_price")
      .neq("financial_status", "VOIDED");

    orders?.forEach(o => {
      const customerId = o.customer_id ? String(o.customer_id) : "";
      const seg = customerToSegment.get(customerId);
      if (seg && segmentMetrics[seg]) {
        segmentMetrics[seg].pedidos += 1;
        segmentMetrics[seg].receita += Number(o.total_price || 0);
      }
    });

    customers.forEach(c => {
      const seg = c.rfm_segment;
      if (seg && segmentMetrics[seg]) {
        segmentMetrics[seg].clientes += 1;
      }
    });

    const totalReceita = Object.values(segmentMetrics).reduce((acc, m) => acc + m.receita, 0);
    const totalClientes = customers.length;

    const summary = Object.entries(segmentMetrics).map(([name, m]) => ({
      name,
      clientes: m.clientes,
      pctBase: totalClientes > 0 ? (m.clientes / totalClientes) * 100 : 0,
      pedidos: m.pedidos,
      frequenciaMedia: m.clientes > 0 ? m.pedidos / m.clientes : 0,
      receita: m.receita,
      pctReceita: totalReceita > 0 ? (m.receita / totalReceita) * 100 : 0,
      aov: m.pedidos > 0 ? m.receita / m.pedidos : 0,
      ltv30: m.receita * 0.1, 
      ltv60: m.receita * 0.15,
      ltv365: m.receita * 0.3
    }));

    return {
      summary,
      totalClientes,
      totalReceita
    };
  });
