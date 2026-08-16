import { useState } from "react";
2: import { 
3:   ChevronRight, 
4:   Users, 
5:   ShoppingCart, 
6:   Tag, 
7:   MessageSquare, 
8:   Mail, 
9:   Zap, 
10:   X, 
11:   Plus,
12:   Trash2,
13:   Save
14: } from "lucide-react";
15: import { Button } from "@/components/ui/button";
16: import { Input } from "@/components/ui/input";
17: import { Label } from "@/components/ui/label";
18: import { 
19:   DropdownMenu, 
20:   DropdownMenuContent, 
21:   DropdownMenuItem, 
22:   DropdownMenuTrigger,
23:   DropdownMenuSub,
24:   DropdownMenuSubTrigger,
25:   DropdownMenuSubContent,
26:   DropdownMenuPortal
27: } from "@/components/ui/dropdown-menu";
28: import { Badge } from "@/components/ui/badge";
29: import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
30: import { useServerFn } from "@tanstack/react-start";
31: import { saveSegment } from "@/lib/crm-segmentation.functions";
32: import { toast } from "sonner";
33: 
34: type RuleCondition = {
35:   id: string;
36:   category: string;
37:   field: string;
38:   operator: string;
39:   value: string | number | boolean;
40:   label: string;
41: };
42: 
43: type RuleGroup = {
44:   id: string;
45:   type: "AND" | "OR";
46:   conditions: RuleCondition[];
47: };
48: 
49: const CATEGORIES = [
50:   {
51:     id: "pessoais",
52:     label: "Dados Pessoais",
53:     icon: Users,
54:     fields: [
55:       { id: "cidade", label: "Cidade" },
56:       { id: "estado", label: "Estado" },
57:       { id: "regiao", label: "Região" },
58:       { id: "bairro", label: "Bairro" },
59:       { id: "aniversario_mes", label: "Mês do Aniversário" },
60:       { id: "aniversario_dia", label: "Dia do Aniversário" },
61:       { id: "idade", label: "Idade" },
62:       { id: "signo", label: "Signo" },
63:     ]
64:   },
65:   {
66:     id: "comportamento",
67:     label: "Comportamento de Compra",
68:     icon: ShoppingCart,
69:     fields: [
70:       { id: "total_gasto", label: "Gasto Total (LTV)" },
71:       { id: "total_pedidos", label: "Total de Pedidos" },
72:       { id: "ultima_compra", label: "Data da Última Compra" },
73:       { id: "primeira_compra", label: "Data da Primeira Compra" },
74:       { id: "ticket_medio", label: "Ticket Médio" },
75:       { id: "recorrencia", label: "Recorrência" },
76:     ]
77:   },
78:   {
79:     id: "tags",
80:     label: "Tags",
81:     icon: Tag,
82:     fields: [
83:       { id: "customer_tag", label: "Tag do Cliente" },
84:       { id: "order_tag", label: "Tag do Pedido" },
85:     ]
86:   },
87:   {
88:     id: "whatsapp",
89:     label: "Whatsapp Marketing",
90:     icon: MessageSquare,
91:     fields: [
92:       { id: "recebeu_campanha", label: "Recebeu Campanha" },
93:       { id: "clicou_campanha", label: "Clicou em Link" },
94:       { id: "nao_recebeu", label: "Não Recebeu Mensagem" },
95:     ]
96:   },
97:   {
98:     id: "automacoes",
99:     label: "Automações",
100:     icon: Zap,
101:     fields: [
102:       { id: "entrou_fluxo", label: "Entrou em Fluxo" },
103:       { id: "concluiu_fluxo", label: "Concluiu Fluxo" },
104:     ]
105:   }
106: ];
107: 
108: const OPERATORS: Record<string, { label: string; value: string }[]> = {
109:   string: [
110:     { label: "É igual a", value: "eq" },
111:     { label: "Não é igual a", value: "neq" },
112:     { label: "Contém", value: "contains" },
113:     { label: "Não contém", value: "not_contains" },
114:     { label: "Começa com", value: "starts_with" },
115:   ],
116:   number: [
117:     { label: "Maior que", value: "gt" },
118:     { label: "Menor que", value: "lt" },
119:     { label: "Igual a", value: "eq" },
120:     { label: "Maior ou igual a", value: "gte" },
121:     { label: "Menor ou igual a", value: "lte" },
122:   ],
123:   date: [
124:     { label: "Antes de", value: "before" },
125:     { label: "Depois de", value: "after" },
126:     { label: "Nos últimos X dias", value: "last_days" },
127:     { label: "Exatamente em", value: "on" },
128:   ]
129: };
130: 
131: export function SegmentEditor({ onCancel, onSave }: { onCancel: () => void, onSave: () => void }) {
132:   const runSave = useServerFn(saveSegment);
133:   const [nome, setNome] = useState("");
134:   const [descricao, setDescricao] = useState("");
135:   const [groups, setGroups] = useState<RuleGroup[]>([
136:     { id: "1", type: "AND", conditions: [] }
137:   ]);
138:   const [isSaving, setIsSaving] = useState(false);
139: 
140:   const addCondition = (groupId: string, category: string, fieldId: string, fieldLabel: string) => {
141:     setGroups(prev => prev.map(g => {
142:       if (g.id !== groupId) return g;
143:       return {
144:         ...g,
145:         conditions: [
146:           ...g.conditions,
147:           {
148:             id: Math.random().toString(36).substr(2, 9),
149:             category,
150:             field: fieldId,
151:             label: fieldLabel,
152:             operator: "eq",
153:             value: ""
154:           }
155:         ]
156:       };
157:     }));
158:   };
159: 
160:   const removeCondition = (groupId: string, conditionId: string) => {
161:     setGroups(prev => prev.map(g => {
162:       if (g.id !== groupId) return g;
163:       return {
164:         ...g,
165:         conditions: g.conditions.filter(c => c.id !== conditionId)
166:       };
167:     }));
168:   };
169: 
170:   const updateCondition = (groupId: string, conditionId: string, patch: Partial<RuleCondition>) => {
171:     setGroups(prev => prev.map(g => {
172:       if (g.id !== groupId) return g;
173:       return {
174:         ...g,
175:         conditions: g.conditions.map(c => c.id === conditionId ? { ...c, ...patch } : c)
176:       };
177:     }));
178:   };
179: 
180:   const handleSave = async () => {
181:     if (!nome.trim()) {
182:       toast.error("Dê um nome ao segmento.");
183:       return;
184:     }
185:     
186:     setIsSaving(true);
187:     try {
188:       await runSave({
189:         data: {
190:           nome,
191:           descricao,
192:           regras: { groups },
193:           tipo: "dinamico"
194:         }
195:       });
196:       toast.success("Segmento criado com sucesso!");
197:       onSave();
198:     } catch (err: any) {
199:       toast.error("Erro ao salvar: " + err.message);
200:     } finally {
201:       setIsSaving(false);
202:     }
203:   };
204: 
205:   return (
206:     <div className="space-y-6">
207:       <div className="flex items-center justify-between">
208:         <div>
209:           <h2 className="text-2xl font-semibold tracking-tight">Criar Segmento</h2>
210:           <p className="text-sm text-muted-foreground">Defina regras para agrupar seus clientes automaticamente.</p>
211:         </div>
212:         <div className="flex gap-2">
213:           <Button variant="outline" onClick={onCancel}>Cancelar</Button>
214:           <Button onClick={handleSave} disabled={isSaving} className="gap-2">
215:             {isSaving ? "Salvando..." : <><Save className="size-4" /> Salvar Segmento</>}
216:           </Button>
217:         </div>
218:       </div>
219: 
220:       <div className="grid gap-4 sm:grid-cols-2">
221:         <div className="space-y-2">
222:           <Label htmlFor="nome">Nome do Segmento</Label>
223:           <Input 
224:             id="nome" 
225:             placeholder="Ex: Clientes VIPs" 
226:             value={nome} 
227:             onChange={e => setNome(e.target.value)}
228:           />
229:         </div>
230:         <div className="space-y-2">
231:           <Label htmlFor="desc">Descrição (opcional)</Label>
232:           <Input 
233:             id="desc" 
234:             placeholder="Ex: Clientes que gastaram mais de R$ 500" 
235:             value={descricao}
236:             onChange={e => setDescricao(e.target.value)}
237:           />
238:         </div>
239:       </div>
240: 
241:       <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
242:         <h3 className="mb-4 flex items-center gap-2 text-lg font-medium">
243:           Regras de Segmentação
244:           <Badge variant="secondary">Dinâmico</Badge>
245:         </h3>
246: 
247:         <div className="space-y-6">
248:           {groups.map((group, gIdx) => (
249:             <div key={group.id} className="relative space-y-4">
250:               {gIdx > 0 && (
251:                 <div className="flex justify-center">
252:                   <Badge className="bg-brand text-white">OU</Badge>
253:                 </div>
254:               )}
255:               
256:               <div className="rounded-lg border border-border bg-muted/30 p-4">
257:                 <div className="flex items-center justify-between mb-4">
258:                   <div className="flex items-center gap-2">
259:                     <Badge variant="outline">Corresponder a TODAS as regras (E)</Badge>
260:                   </div>
261:                 </div>
262: 
263:                 <div className="space-y-3">
264:                   {group.conditions.map((condition) => (
265:                     <div key={condition.id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2 pr-4">
266:                       <Badge variant="secondary" className="h-8 rounded-sm px-2">
267:                         {condition.label}
268:                       </Badge>
269:                       
270:                       <Select 
271:                         value={condition.operator} 
272:                         onValueChange={v => updateCondition(group.id, condition.id, { operator: v })}
273:                       >
274:                         <SelectTrigger className="h-8 w-[140px] border-none bg-muted/50 text-xs">
275:                           <SelectValue />
276:                         </SelectTrigger>
277:                         <SelectContent>
278:                           {(condition.field.includes("gasto") || condition.field.includes("total") || condition.field.includes("ticket") || condition.field.includes("idade")) ? 
279:                             OPERATORS.number.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>) :
280:                             (condition.field.includes("compra") ? 
281:                               OPERATORS.date.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>) :
282:                               OPERATORS.string.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)
283:                             )
284:                           }
285:                         </SelectContent>
286:                       </Select>
287: 
288:                       <Input 
289:                         className="h-8 flex-1 border-none bg-muted/50 text-xs" 
290:                         placeholder="Valor..." 
291:                         value={condition.value as string}
292:                         onChange={e => updateCondition(group.id, condition.id, { value: e.target.value })}
293:                       />
294: 
295:                       <Button 
296:                         variant="ghost" 
297:                         size="icon" 
298:                         className="h-8 w-8 text-muted-foreground hover:text-destructive"
299:                         onClick={() => removeCondition(group.id, condition.id)}
300:                       >
301:                         <Trash2 className="size-4" />
302:                       </Button>
303:                     </div>
304:                   ))}
305: 
306:                   <DropdownMenu>
307:                     <DropdownMenuTrigger asChild>
308:                       <Button variant="outline" size="sm" className="w-full border-dashed gap-2 text-muted-foreground">
309:                         <Plus className="size-4" /> Adicionar Filtro
310:                       </Button>
311:                     </DropdownMenuTrigger>
312:                     <DropdownMenuContent className="w-64" align="start">
313:                       {CATEGORIES.map(cat => (
314:                         <DropdownMenuSub key={cat.id}>
315:                           <DropdownMenuSubTrigger className="gap-2">
316:                             <cat.icon className="size-4" />
317:                             <span>{cat.label}</span>
318:                           </DropdownMenuSubTrigger>
319:                           <DropdownMenuPortal>
320:                             <DropdownMenuSubContent className="w-64">
321:                               {cat.fields.map(field => (
322:                                 <DropdownMenuItem 
323:                                   key={field.id}
324:                                   onClick={() => addCondition(group.id, cat.id, field.id, field.label)}
325:                                 >
326:                                   {field.label}
327:                                 </DropdownMenuItem>
328:                               ))}
329:                             </DropdownMenuSubContent>
330:                           </DropdownMenuPortal>
331:                         </DropdownMenuSub>
332:                       ))}
333:                     </DropdownMenuContent>
334:                   </DropdownMenu>
335:                 </div>
336:               </div>
337:             </div>
338:           ))}
339: 
340:           <Button 
341:             variant="ghost" 
342:             className="w-full gap-2 text-brand hover:bg-brand/5 hover:text-brand"
343:             onClick={() => setGroups(prev => [...prev, { id: Math.random().toString(), type: "OR", conditions: [] }])}
344:           >
345:             <Plus className="size-4" /> Adicionar novo grupo de regras (OU)
346:           </Button>
347:         </div>
348:       </div>
349:     </div>
350:   );
351: }