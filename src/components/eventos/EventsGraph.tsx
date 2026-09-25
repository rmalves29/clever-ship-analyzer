import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import type { CrmEvent, EventCategory } from "@/lib/events.server";

type NodeType = "category" | "canal" | "event";

type GraphNode = {
  id: string;
  label: string;
  type: NodeType;
  degree: number;
  event?: CrmEvent | undefined;
};

type GraphEdge = { source: string; target: string };

type PositionedNode = GraphNode & { x: number; y: number; r: number };

/** Viewport fixo (o que aparece na tela) — o espaço onde a simulação roda escala com o número
 *  de nós, então o zoom inicial sempre enquadra o grafo inteiro, não importa quantos eventos. */
const VIEW_W = 820;
const VIEW_H = 480;

function buildGraph(events: CrmEvent[], categoryLabel: Record<EventCategory, string>) {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const ensure = (id: string, label: string, type: NodeType, event?: CrmEvent) => {
    const existing = nodes.get(id);
    if (existing) return existing;
    const node: GraphNode = { id, label, type, degree: 0, event };
    nodes.set(id, node);
    return node;
  };

  for (const ev of events) {
    const evId = `event:${ev.id}`;
    const evNode = ensure(evId, ev.title, "event", ev);

    const catId = `cat:${ev.category}`;
    const catNode = ensure(catId, categoryLabel[ev.category], "category");
    edges.push({ source: evId, target: catId });
    evNode.degree++;
    catNode.degree++;

    for (const canal of ev.canais) {
      const canalId = `canal:${canal}`;
      const canalNode = ensure(canalId, canal, "canal");
      edges.push({ source: evId, target: canalId });
      evNode.degree++;
      canalNode.degree++;
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

/** Gerador pseudo-aleatório determinístico — evita divergência entre o layout calculado no
 *  servidor (SSR) e no cliente, que aconteceria com Math.random(). */
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function radiusFor(n: GraphNode) {
  if (n.type === "event") return Math.min(8, 4 + Math.sqrt(n.degree) * 1.4);
  return Math.min(36, 14 + Math.sqrt(n.degree) * 3.8);
}

/** Layout em duas camadas — muito poucos "hubs" (categoria/canal) recebem centenas de eventos
 *  cada, e nesse formato (poucos nós com grau altíssimo) a física pura sempre puxa os hubs de
 *  volta pro centro comum, colando um no outro e embolando tudo. Em vez de deixar isso pro acaso:
 *  1) hubs vão num círculo com espaçamento calculado pra nunca se tocarem (posição fixa durante
 *     a simulação, então nunca colidem entre si);
 *  2) só os eventos se movem por força (repulsão entre eles + mola puxando pro(s) hub(s)
 *     conectado(s)), formando um "halo" ao redor de cada hub — mesmo efeito de cluster do
 *     grafo de conhecimento de referência, só que garantido por construção. */
function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]) {
  const rand = seededRandom(42);

  const radius = new Map<string, number>();
  nodes.forEach((n) => radius.set(n.id, radiusFor(n)));

  const hubs = nodes.filter((n) => n.type !== "event");
  const leaves = nodes.filter((n) => n.type === "event");

  const pos = new Map<string, { x: number; y: number; vx: number; vy: number; fixed: boolean }>();

  const maxHubR = hubs.reduce((m, h) => Math.max(m, radius.get(h.id)!), 20);
  const hubOrbit = hubs.length <= 1 ? 0 : Math.max(190, ((maxHubR * 2 + 70) * hubs.length) / (2 * Math.PI));
  hubs.forEach((h, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, hubs.length) - Math.PI / 2;
    pos.set(h.id, {
      x: hubs.length <= 1 ? 0 : Math.cos(angle) * hubOrbit,
      y: hubs.length <= 1 ? 0 : Math.sin(angle) * hubOrbit,
      vx: 0,
      vy: 0,
      fixed: true,
    });
  });

  const neighborsOf = new Map<string, string[]>();
  const addNeighbor = (a: string, b: string) => {
    const list = neighborsOf.get(a);
    if (list) list.push(b);
    else neighborsOf.set(a, [b]);
  };
  for (const e of edges) {
    addNeighbor(e.source, e.target);
    addNeighbor(e.target, e.source);
  }

  // Evento começa perto do centroide dos hubs que ele conecta (categoria + canal(is)), já
  // aproximando bastante do resultado final antes mesmo da simulação rodar.
  leaves.forEach((n) => {
    const neigh = neighborsOf.get(n.id) ?? [];
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const nb of neigh) {
      const p = pos.get(nb);
      if (p) {
        cx += p.x;
        cy += p.y;
        count++;
      }
    }
    if (count > 0) {
      cx /= count;
      cy /= count;
    }
    pos.set(n.id, { x: cx + (rand() - 0.5) * 140, y: cy + (rand() - 0.5) * 140, vx: 0, vy: 0, fixed: false });
  });

  const REPULSION = 950;
  const SPRING_LENGTH = 64;
  const SPRING_K = 0.05;
  const DAMPING = 0.82;

  for (let iter = 0; iter < 240; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i]!.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j]!.id)!;
        if (a.fixed && b.fixed) continue; // hubs já espaçados por construção
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(1, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    for (const e of edges) {
      const a = pos.get(e.source)!;
      const b = pos.get(e.target)!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = dist - SPRING_LENGTH;
      const fx = (dx / dist) * diff * SPRING_K;
      const fy = (dy / dist) * diff * SPRING_K;
      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    for (const n of leaves) {
      const p = pos.get(n.id)!;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
    }
  }

  // Passada de separação: empurra qualquer par de nós ainda sobrepondo pra fora (hubs ficam
  // parados — só entram como obstáculo pros eventos ao redor), garantindo rótulos e círculos
  // legíveis mesmo quando a força não convergiu perfeitamente.
  for (let pass = 0; pass < 50; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i]!.id)!;
      const ra = radius.get(nodes[i]!.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j]!.id)!;
        if (a.fixed && b.fixed) continue;
        const rb = radius.get(nodes[j]!.id)!;
        const minDist = ra + rb + 14;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < minDist) {
          const push = minDist - dist;
          const ux = dx / dist;
          const uy = dy / dist;
          if (a.fixed) {
            b.x += ux * push;
            b.y += uy * push;
          } else if (b.fixed) {
            a.x -= ux * push;
            a.y -= uy * push;
          } else {
            a.x -= ux * (push / 2);
            a.y -= uy * (push / 2);
            b.x += ux * (push / 2);
            b.y += uy * (push / 2);
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  const positioned: PositionedNode[] = nodes.map((n) => {
    const p = pos.get(n.id)!;
    return { ...n, x: p.x, y: p.y, r: radius.get(n.id)! };
  });

  const pad = 40;
  const bbox = positioned.reduce(
    (acc, n) => ({
      minX: Math.min(acc.minX, n.x - n.r - pad),
      minY: Math.min(acc.minY, n.y - n.r - pad),
      maxX: Math.max(acc.maxX, n.x + n.r + pad),
      maxY: Math.max(acc.maxY, n.y + n.r + pad),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  return { nodes: positioned, bbox };
}

const TYPE_COLOR: Record<NodeType, string> = {
  category: "#a78bfa",
  canal: "#fbbf24",
  event: "#7c8aa3",
};

const TYPE_GLOW: Record<NodeType, string> = {
  category: "#8b5cf6",
  canal: "#f59e0b",
  event: "#64748b",
};

type Transform = { x: number; y: number; k: number };
const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, k: 1 };

export function EventsGraph({
  events,
  categoryLabel,
}: {
  events: CrmEvent[];
  categoryLabel: Record<EventCategory, string>;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const activeId = pinnedId ?? hoverId;

  const { nodes, edges, bbox } = useMemo(() => {
    const { nodes: rawNodes, edges } = buildGraph(events, categoryLabel);
    const { nodes, bbox } = layoutGraph(rawNodes, edges);
    return { nodes, edges, bbox };
  }, [events, categoryLabel]);

  const fitTransform = useMemo<Transform>(() => {
    const graphW = bbox.maxX - bbox.minX;
    const graphH = bbox.maxY - bbox.minY;
    if (!Number.isFinite(graphW) || !Number.isFinite(graphH) || graphW <= 0 || graphH <= 0) {
      return IDENTITY_TRANSFORM;
    }
    const k = Math.min(VIEW_W / graphW, VIEW_H / graphH, 1.6);
    return {
      k,
      x: VIEW_W / 2 - ((bbox.minX + bbox.maxX) / 2) * k,
      y: VIEW_H / 2 - ((bbox.minY + bbox.maxY) / 2) * k,
    };
  }, [bbox]);

  const [transform, setTransform] = useState<Transform>(fitTransform);
  useEffect(() => setTransform(fitTransform), [fitTransform]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connected = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    for (const e of edges) {
      if (e.source === activeId) set.add(e.target);
      if (e.target === activeId) set.add(e.source);
    }
    return set;
  }, [activeId, edges]);

  const activeNode = activeId ? nodeById.get(activeId) : undefined;

  const zoomBy = (factor: number) => {
    setTransform((t) => ({ ...t, k: Math.min(4, Math.max(0.2, t.k * factor)) }));
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    zoomBy(1 - e.deltaY * 0.0016);
  };

  const clientToViewBoxDelta = (dxCss: number, dyCss: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { dx: dxCss, dy: dyCss };
    return { dx: (dxCss / rect.width) * VIEW_W, dy: (dyCss / rect.height) * VIEW_H };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: transform.x, startY: transform.y };
    setDragging(true);
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const { dx, dy } = clientToViewBoxDelta(e.clientX - dragRef.current.startClientX, e.clientY - dragRef.current.startClientY);
    setTransform((t) => ({ ...t, x: dragRef.current!.startX + dx, y: dragRef.current!.startY + dy }));
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Registre eventos nesse período pra ver o grafo de conexões (evento ↔ categoria ↔ canal).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Grafo de conexões</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.category }} /> Categoria</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.canal }} /> Canal</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.event }} /> Evento</span>
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-lg border border-border" style={{ background: "#0a0d14" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full touch-none select-none"
          style={{ height: 460, cursor: dragging ? "grabbing" : "grab" }}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onDoubleClick={() => setTransform(fitTransform)}
        >
          <defs>
            <radialGradient id="graph-bg" cx="50%" cy="42%" r="75%">
              <stop offset="0%" stopColor="#161b28" />
              <stop offset="100%" stopColor="#0a0d14" />
            </radialGradient>
            <filter id="graph-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="url(#graph-bg)" />

          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            {edges.map((e, i) => {
              const a = nodeById.get(e.source);
              const b = nodeById.get(e.target);
              if (!a || !b) return null;
              const dim = connected && !(connected.has(e.source) && connected.has(e.target));
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={dim ? "#2a3142" : "#4b5568"}
                  strokeWidth={dim ? 1 : 1.3}
                  opacity={dim ? 0.35 : 0.85}
                />
              );
            })}

            {nodes.map((n) => {
              const isHub = n.type !== "event";
              const dim = connected ? !connected.has(n.id) : false;
              const isActive = n.id === activeId;
              const showLabel = isHub || isActive || (connected ? connected.has(n.id) : false);
              const color = TYPE_COLOR[n.type];
              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => setPinnedId((p) => (p === n.id ? null : n.id))}
                  style={{ cursor: "pointer" }}
                  opacity={dim ? 0.22 : 1}
                >
                  {isHub && (
                    <circle cx={n.x} cy={n.y} r={n.r} fill={TYPE_GLOW[n.type]} opacity={0.28} filter="url(#graph-glow)" />
                  )}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={isActive ? "#f8fafc" : color}
                    stroke={isActive ? color : "transparent"}
                    strokeWidth={isActive ? 2.5 : 0}
                  />
                  {showLabel && (
                    <text
                      x={n.x}
                      y={n.y - n.r - 6}
                      textAnchor="middle"
                      fontSize={isHub ? 13 : 11}
                      fontWeight={isHub ? 700 : 500}
                      fill={isHub ? "#f1f5f9" : "#cbd5e1"}
                      style={{ paintOrder: "stroke", stroke: "#0a0d14", strokeWidth: 3 }}
                    >
                      {n.label.length > 30 ? `${n.label.slice(0, 28)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute right-2 top-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => zoomBy(1.3)}
            className="flex size-7 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/80 backdrop-blur hover:bg-black/60"
            aria-label="Aumentar zoom"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.3)}
            className="flex size-7 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/80 backdrop-blur hover:bg-black/60"
            aria-label="Diminuir zoom"
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            onClick={() => setTransform(fitTransform)}
            className="flex size-7 items-center justify-center rounded-md border border-white/10 bg-black/40 text-white/80 backdrop-blur hover:bg-black/60"
            aria-label="Ajustar à tela"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {activeNode?.event
          ? `${new Date(activeNode.event.eventDate + "T00:00:00").toLocaleDateString("pt-BR")} — ${activeNode.event.title}`
          : activeNode
            ? activeNode.label
            : "Passe o mouse (ou toque) num nó pra destacar as conexões — clique pra fixar. Role a roda pra dar zoom e arraste pra mover."}
      </p>
    </div>
  );
}
