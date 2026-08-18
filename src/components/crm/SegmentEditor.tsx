import { useState } from "react";
import { 
  ChevronRight, 
  Users, 
  ShoppingCart, 
  Tag, 
  MessageSquare, 
  Mail, 
  Zap, 
  X, 
  Plus,
  Trash2,
  Save,
  ArrowLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { saveSegment } from "@/lib/crm-segmentation.functions";
import { toast } from "sonner";

type RuleCondition = {
  id: string;
  category: string;
  field: string;
  operator: string;
  value: string | number | boolean;
  label: string;
};

type RuleGroup = {
  id: string;
  type: "AND" | "OR";
  conditions: RuleCondition[];
};

const CATEGORIES = [
  {
    id: "pessoais",
    label: "Dados Pessoais",
    icon: Users,
    fields: [
      { id: "cidade", label: "Cidade" },
      { id: "estado", label: "Estado" },
      { id: "regiao", label: "Região" },
      { id: "bairro", label: "Bairro" },
      { id: "aniversario_mes", label: "Mês do Aniversário" },
      { id: "aniversario_dia", label: "Dia do Aniversário" },
      { id: "idade", label: "Idade" },
      { id: "signo", label: "Signo" },
    ]
  },
  {
    id: "comportamento",
    label: "Comportamento de Compra",
    icon: ShoppingCart,
    fields: [
      { id: "total_gasto", label: "Gasto Total (LTV)" },
      { id: "total_pedidos", label: "Total de Pedidos" },
      { id: "ultima_compra", label: "Data da Última Compra" },
      { id: "primeira_compra", label: "Data da Primeira Compra" },
      { id: "ticket_medio", label: "Ticket Médio" },
      { id: "recorrencia", label: "Recorrência" },
      { id: "status_pagamento", label: "Status do Pagamento" },
      { id: "perfil", label: "Perfil do Cliente" },
    ]
  },
  {
    id: "tags",
    label: "Tags",
    icon: Tag,
    fields: [
      { id: "customer_tag", label: "Tag do Cliente" },
      { id: "order_tag", label: "Tag do Pedido" },
    ]
  },
  {
    id: "rfm",
    label: "Análise RFM",
    icon: Zap,
    fields: [
      { id: "rfm_segment", label: "Segmento RFM" },
    ]
  },
  {
    id: "whatsapp",
    label: "Whatsapp Marketing",
    icon: MessageSquare,
    fields: [
      { id: "recebeu_campanha", label: "Recebeu Campanha" },
      { id: "clicou_campanha", label: "Clicou em Link" },
      { id: "nao_recebeu", label: "Não Recebeu Mensagem" },
    ]
  },
  {
    id: "automacoes",
    label: "Automações",
    icon: Zap,
    fields: [
      { id: "entrou_fluxo", label: "Entrou em Fluxo" },
      { id: "concluiu_fluxo", label: "Concluiu Fluxo" },
    ]
  }
];

const OPERATORS = {
  string: [
    { label: "É igual a", value: "eq" },
    { label: "Não é igual a", value: "neq" },
    { label: "Contém", value: "contains" },
    { label: "Não contém", value: "not_contains" },
    { label: "Começa com", value: "starts_with" },
  ],
  number: [
    { label: "Maior que", value: "gt" },
    { label: "Menor que", value: "lt" },
    { label: "Igual a", value: "eq" },
    { label: "Maior ou igual a", value: "gte" },
    { label: "Menor ou igual a", value: "lte" },
  ],
  date: [
    { label: "Antes de", value: "before" },
    { label: "Depois de", value: "after" },
    { label: "Nos últimos X dias", value: "last_days" },
    { label: "Exatamente em", value: "on" },
  ]
} as const;

export function SegmentEditor({ 
  onCancel, 
  onSave, 
  initialData 
}: { 
  onCancel: () => void, 
  onSave: () => void,
  initialData?: { id: string, nome: string, descricao: string, regras: any }
}) {
  const runSave = useServerFn(saveSegment);
  const [nome, setNome] = useState(initialData?.nome || "");
  const [descricao, setDescricao] = useState(initialData?.descricao || "");
  const [groups, setGroups] = useState<RuleGroup[]>(
    initialData?.regras?.groups || [{ id: "1", type: "AND", conditions: [] }]
  );
  const [isSaving, setIsSaving] = useState(false);

  const addCondition = (groupId: string, category: string, fieldId: string, fieldLabel: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        conditions: [
          ...g.conditions,
          {
            id: Math.random().toString(36).substr(2, 9),
            category,
            field: fieldId,
            label: fieldLabel,
            operator: "eq",
            value: ""
          }
        ]
      };
    }));
  };

  const removeCondition = (groupId: string, conditionId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        conditions: g.conditions.filter(c => c.id !== conditionId)
      };
    }));
  };

  const updateCondition = (groupId: string, conditionId: string, patch: Partial<RuleCondition>) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        conditions: g.conditions.map(c => c.id === conditionId ? { ...c, ...patch } : c)
      };
    }));
  };

  const handleSave = async () => {
    if (!nome.trim()) {
      toast.error("Dê um nome ao segmento.");
      return;
    }
    
    setIsSaving(true);
    try {
      await runSave({
        data: {
          id: initialData?.id,
          nome,
          descricao,
          regras: { groups },
          tipo: "dinamico"
        }
      });
      toast.success(initialData?.id ? "Segmento atualizado com sucesso!" : "Segmento criado com sucesso!");
      onSave();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{initialData?.id ? "Editar Segmento" : "Criar Segmento"}</h2>
            <p className="text-sm text-muted-foreground">Defina regras para agrupar seus clientes automaticamente.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 bg-brand text-white hover:bg-brand/90">
            {isSaving ? "Salvando..." : <><Save className="size-4" /> Salvar Segmento</>}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome do Segmento</Label>
          <Input 
            id="nome" 
            placeholder="Ex: Clientes VIPs" 
            value={nome} 
            onChange={e => setNome(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="desc">Descrição (opcional)</Label>
          <Input 
            id="desc" 
            placeholder="Ex: Clientes que gastaram mais de R$ 500" 
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-medium">
          Regras de Segmentação
          <Badge variant="secondary">Dinâmico</Badge>
        </h3>

        <div className="space-y-6">
          {groups.map((group, gIdx) => (
            <div key={group.id} className="relative space-y-4">
              {gIdx > 0 && (
                <div className="flex justify-center relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <Badge className="bg-brand text-white relative z-10 px-4">OU</Badge>
                </div>
              )}
              
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] font-normal border-brand/20 text-brand uppercase tracking-wider">
                      Corresponder a TODAS as regras (E)
                    </Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  {group.conditions.map((condition) => (
                    <div key={condition.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2 pr-4 shadow-sm">
                      <div className="flex items-center gap-2 w-[180px]">
                        <div className="bg-muted p-1 rounded">
                          {(() => {
                            const cat = CATEGORIES.find(c => c.id === condition.category);
                            const Icon = cat?.icon || Users;
                            return <Icon className="size-3 text-muted-foreground" />;
                          })()}
                        </div>
                        <span className="text-xs font-medium truncate">{condition.label}</span>
                      </div>
                      
                      <Select 
                        value={condition.operator} 
                        onValueChange={v => updateCondition(group.id, condition.id, { operator: v })}
                      >
                        <SelectTrigger className="h-8 w-[160px] border-none bg-muted/50 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(() => {
                            if (condition.field.includes("gasto") || condition.field.includes("total") || condition.field.includes("ticket") || condition.field.includes("idade")) {
                              return OPERATORS.number.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>);
                            }
                            if (condition.field.includes("compra")) {
                              return OPERATORS.date.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>);
                            }
                            return OPERATORS.string.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>);
                          })()}
                        </SelectContent>
                      </Select>

                      {condition.field === "status_pagamento" ? (
                        <Select
                          value={condition.value as string}
                          onValueChange={v => updateCondition(group.id, condition.id, { value: v })}
                        >
                          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs">
                            <SelectValue placeholder="Selecionar status..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="paid">Pago (Paid)</SelectItem>
                            <SelectItem value="pending">Pendente (Pending)</SelectItem>
                            <SelectItem value="refunded">Reembolsado (Refunded)</SelectItem>
                            <SelectItem value="partially_refunded">Parcialmente Reembolsado</SelectItem>
                            <SelectItem value="voided">Anulado (Voided)</SelectItem>
                            <SelectItem value="authorized">Autorizado (Authorized)</SelectItem>
                            <SelectItem value="partially_paid">Parcialmente Pago</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : condition.field === "rfm_segment" ? (
                        <Select
                          value={condition.value as string}
                          onValueChange={v => updateCondition(group.id, condition.id, { value: v })}
                        >
                          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs">
                            <SelectValue placeholder="Selecionar segmento..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Campeões">Campeões</SelectItem>
                            <SelectItem value="Leais">Leais</SelectItem>
                            <SelectItem value="Potencialmente Leais">Potencialmente Leais</SelectItem>
                            <SelectItem value="Novos">Novos</SelectItem>
                            <SelectItem value="Precisa de Atenção">Precisa de Atenção</SelectItem>
                            <SelectItem value="Quase Hibernando">Quase Hibernando</SelectItem>
                            <SelectItem value="Em Risco">Em Risco</SelectItem>
                            <SelectItem value="Hibernando">Hibernando</SelectItem>
                            <SelectItem value="Não pode perder">Não pode perder</SelectItem>
                            <SelectItem value="Perdidos">Perdidos</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : condition.field === "perfil" ? (
                        <Select
                          value={condition.value as string}
                          onValueChange={v => updateCondition(group.id, condition.id, { value: v })}
                        >
                          <SelectTrigger className="h-8 flex-1 border-none bg-muted/50 text-xs">
                            <SelectValue placeholder="Selecionar perfil..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="carrinho">Carrinho Abandonado</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input 
                          className="h-8 flex-1 border-none bg-muted/50 text-xs" 
                          placeholder="Valor..." 
                          value={condition.value as string}
                          onChange={e => updateCondition(group.id, condition.id, { value: e.target.value })}
                        />
                      )}

                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeCondition(group.id, condition.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full border-dashed border-2 gap-2 text-muted-foreground hover:text-brand hover:border-brand/50">
                        <Plus className="size-4" /> Adicionar Filtro
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64" align="start">
                      {CATEGORIES.map(cat => (
                        <DropdownMenuSub key={cat.id}>
                          <DropdownMenuSubTrigger className="gap-2">
                            <cat.icon className="size-4" />
                            <span>{cat.label}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuPortal>
                            <DropdownMenuSubContent className="w-64">
                              {cat.fields.map(field => (
                                <DropdownMenuItem 
                                  key={field.id}
                                  onClick={() => addCondition(group.id, cat.id, field.id, field.label)}
                                >
                                  {field.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuPortal>
                        </DropdownMenuSub>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}

          <Button 
            variant="ghost" 
            className="w-full gap-2 text-brand hover:bg-brand/5 hover:text-brand border border-dashed border-brand/30"
            onClick={() => setGroups(prev => [...prev, { id: Math.random().toString(), type: "OR", conditions: [] }])}
          >
            <Plus className="size-4" /> Adicionar novo grupo de regras (OU)
          </Button>
        </div>
      </div>
    </div>
  );
}