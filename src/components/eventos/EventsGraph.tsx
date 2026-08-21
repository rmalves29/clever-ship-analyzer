import { useMemo, useState } from "react";
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

type PositionedNode = GraphNode & { x: number; y: number };

const WIDTH = 760;
const HEIGHT = 460;

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

/** Layout força-dirigida simples (repulsão entre nós, mola nas arestas, centralização) —
 *  o mesmo princípio do grafo do Obsidian, sem depender de nenhuma lib externa. */
function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): PositionedNode[] {
  const rand = seededRandom(42);
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  nodes.forEach((n) => {
    pos.set(n.id, {
      x: WIDTH / 2 + (rand() - 0.5) * WIDTH * 0.8,
      y: HEIGHT / 2 + (rand() - 0.5) * HEIGHT * 0.8,
      vx: 0,
      vy: 0,
    });
  });

  const REPULSION = 1800;
  const SPRING_LENGTH = 80;
  const SPRING_K = 0.02;
  const CENTER_K = 0.012;
  const DAMPING = 0.85;

  for (let iter = 0; iter < 250; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i]!.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j]!.id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = Math.max(1, dx * dx + dy * dy);
        const dist = Math.sqrt(distSq);
        const force = REPULSION / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
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
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    for (const n of nodes) {
      const p = pos.get(n.id)!;
      p.vx += (WIDTH / 2 - p.x) * CENTER_K;
      p.vy += (HEIGHT / 2 - p.y) * CENTER_K;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x += p.vx;
      p.y += p.vy;
      p.x = Math.max(32, Math.min(WIDTH - 32, p.x));
      p.y = Math.max(32, Math.min(HEIGHT - 32, p.y));
    }
  }

  return nodes.map((n) => ({ ...n, ...pos.get(n.id)! }));
}

const TYPE_COLOR: Record<NodeType, string> = {
  category: "hsl(var(--primary))",
  canal: "hsl(var(--warning))",
  event: "hsl(var(--muted-foreground))",
};

function radiusFor(n: GraphNode) {
  const base = n.type === "event" ? 5 : 10;
  return Math.min(30, base + Math.sqrt(n.degree) * 3.2);
}

export function EventsGraph({
  events,
  categoryLabel,
}: {
  events: CrmEvent[];
  categoryLabel: Record<EventCategory, string>;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    const { nodes, edges } = buildGraph(events, categoryLabel);
    return { nodes: layoutGraph(nodes, edges), edges };
  }, [events, categoryLabel]);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connected = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    for (const e of edges) {
      if (e.source === hoverId) set.add(e.target);
      if (e.target === hoverId) set.add(e.source);
    }
    return set;
  }, [hoverId, edges]);

  const hoveredEvent = hoverId ? nodeById.get(hoverId)?.event : undefined;

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Registre eventos nesse período pra ver o grafo de conexões (evento ↔ categoria ↔ canal).
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Grafo de conexões</p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.category }} /> Categoria</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.canal }} /> Canal</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: TYPE_COLOR.event }} /> Evento</span>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: 440 }}>
          {edges.map((e, i) => {
            const a = nodeById.get(e.source)!;
            const b = nodeById.get(e.target)!;
            const dim = connected && !(connected.has(e.source) && connected.has(e.target));
            return (
              <line
                key={i}
                x1={(a as PositionedNode).x}
                y1={(a as PositionedNode).y}
                x2={(b as PositionedNode).x}
                y2={(b as PositionedNode).y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                opacity={dim ? 0.12 : 0.55}
              />
            );
          })}
          {(nodes as PositionedNode[]).map((n) => {
            const dim = connected && !connected.has(n.id);
            const r = radiusFor(n);
            return (
              <g key={n.id} onMouseEnter={() => setHoverId(n.id)} onMouseLeave={() => setHoverId(null)}>
                <circle cx={n.x} cy={n.y} r={r} fill={TYPE_COLOR[n.type]} opacity={dim ? 0.2 : 0.9} />
                <text
                  x={n.x}
                  y={n.y - r - 4}
                  textAnchor="middle"
                  fontSize={n.type === "event" ? 9 : 11}
                  fontWeight={n.type === "event" ? 400 : 600}
                  fill="hsl(var(--foreground))"
                  opacity={dim ? 0.2 : 1}
                >
                  {n.label.length > 26 ? `${n.label.slice(0, 24)}…` : n.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {hoveredEvent
          ? `${new Date(hoveredEvent.eventDate + "T00:00:00").toLocaleDateString("pt-BR")} — ${hoveredEvent.title}`
          : "Passe o mouse sobre um nó pra destacar as conexões dele."}
      </p>
    </div>
  );
}
