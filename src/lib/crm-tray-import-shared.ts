export type TrayFinancialStatus = "PAID" | "CANCELLED" | "PENDING";

export type TrayImportCustomer = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  firstOrderAt: string;
  lastOrderAt: string;
};

export type TrayImportOrder = {
  id: string;
  orderNumber: string;
  trayOrderCode: string;
  customerId: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  processedAt: string;
  updatedAt: string;
  financialStatus: TrayFinancialStatus;
  fulfillmentStatus: string | null;
  subtotalPrice: number;
  totalDiscounts: number;
  totalShippingPrice: number;
  totalTax: number;
  totalPrice: number;
  city: string | null;
  province: string | null;
  country: string | null;
  paymentType: string | null;
  paymentDate: string | null;
  shippingType: string | null;
  coupon: string | null;
  utmSource: string | null;
  rawStatus: string | null;
  channel: string | null;
  trayCustomerCode: string | null;
};

export type TrayImportItem = {
  id: string;
  orderId: string;
  trayOrderCode: string;
  trayProductCode: string;
  productId: string;
  sku: string | null;
  title: string;
  quantity: number;
  price: number;
  totalDiscount: number;
};

export type TrayImportStats = {
  orderCount: number;
  itemLineCount: number;
  unitCount: number;
  customerCount: number;
  paidOrderCount: number;
  cancelledOrderCount: number;
  pendingOrderCount: number;
  unmatchedItemCount: number;
  ordersWithoutItems: number;
  subtotalMismatchCount: number;
  periodStart: string | null;
  periodEnd: string | null;
};

export type TrayImportDataset = {
  customers: TrayImportCustomer[];
  orders: TrayImportOrder[];
  items: TrayImportItem[];
  stats: TrayImportStats;
  warnings: string[];
};

type CsvRow = Record<string, string>;

const TRAY_PAID_STATUSES = new Set([
  "FINALIZADO",
  "ENVIADO",
  "PEDIDO EM PRODUCAO",
  "PROBLEMAS NA ENTREGA",
]);

function plainUpper(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function clean(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized || null;
}

export function decodeTrayCsvBytes(buffer: ArrayBuffer): string {
  return new TextDecoder("windows-1252").decode(buffer);
}

export function parseTrayCsvText(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char == null) continue;

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  const firstRow = rows.at(0);
  if (!firstRow) return [];

  const headers = firstRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );

  return rows.slice(1).map((values) => {
    const result: CsvRow = {};
    headers.forEach((header, index) => {
      result[header] = (values[index] ?? "").trim();
    });
    return result;
  });
}

export function parseBrazilianMoney(value: string | null | undefined): number {
  const raw = String(value ?? "").trim().replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function normalizeTrayPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return `+${digits}`;
}

export function trayStatusToFinancialStatus(status: string | null | undefined): TrayFinancialStatus {
  const normalized = plainUpper(status);
  if (TRAY_PAID_STATUSES.has(normalized)) return "PAID";
  if (normalized.startsWith("CANCELADO")) return "CANCELLED";
  return "PENDING";
}

export function trayStatusToFulfillmentStatus(status: string | null | undefined): string | null {
  const normalized = plainUpper(status);
  if (["FINALIZADO", "ENVIADO", "PROBLEMAS NA ENTREGA"].includes(normalized)) return "FULFILLED";
  if (normalized === "PEDIDO EM PRODUCAO") return "UNFULFILLED";
  return null;
}

function dateTimeIso(dateValue: string | null | undefined, timeValue?: string | null): string | null {
  const match = String(dateValue ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = match[1] ?? "";
  const month = match[2] ?? "";
  const year = match[3] ?? "";
  if (!day || !month || !year) return null;

  const timeMatch = String(timeValue ?? "00:00:00").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const hour = (timeMatch?.[1] ?? "00").padStart(2, "0");
  const minute = timeMatch?.[2] ?? "00";
  const second = timeMatch?.[3] ?? "00";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour}:${minute}:${second}-03:00`;
}

function laterIso(values: Array<string | null>): string {
  const valid = values.filter((value): value is string => Boolean(value));
  if (valid.length === 0) return new Date(0).toISOString();
  let latest = valid[0] ?? new Date(0).toISOString();
  for (const current of valid.slice(1)) {
    if (new Date(current).getTime() > new Date(latest).getTime()) latest = current;
  }
  return latest;
}

function splitName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts.at(0) ?? null;
  if (!firstName) return { firstName: null, lastName: null };
  return {
    firstName,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function cleanProductTitle(value: string | null | undefined): string {
  return (
    String(value ?? "Produto Tray")
      .replace(/\s*\(Disponibilidade:[^)]*\)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim() || "Produto Tray"
  );
}

function assertColumns(rows: CsvRow[], required: string[], label: string) {
  const firstRow = rows.at(0);
  if (!firstRow) throw new Error(`O arquivo de ${label} está vazio.`);
  const columns = new Set(Object.keys(firstRow));
  const missing = required.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    throw new Error(`O arquivo de ${label} não possui as colunas esperadas: ${missing.join(", ")}.`);
  }
}

export function buildTrayImportDataset(orderRows: CsvRow[], itemRows: CsvRow[]): TrayImportDataset {
  assertColumns(
    orderRows,
    ["Pedido", "Data", "Hora", "Nome do Cliente", "Email", "Subtotal produtos", "Status pedido", "Total"],
    "pedidos",
  );
  assertColumns(
    itemRows,
    ["Código produto", "Código pedido", "Nome produto", "Preço venda", "Quantidade", "Referência"],
    "produtos vendidos",
  );

  const customers = new Map<string, TrayImportCustomer>();
  const orders: TrayImportOrder[] = [];
  const orderCodes = new Set<string>();

  for (const row of orderRows) {
    const trayOrderCode = String(row["Pedido"] ?? "").trim();
    if (!trayOrderCode) continue;
    const createdAt = dateTimeIso(row["Data"], row["Hora"]);
    if (!createdAt) continue;

    const email = clean(row["Email"])?.toLowerCase() ?? null;
    const trayCustomerCode = clean(row["Código cliente"]);
    const customerId = email
      ? `email:${email}`
      : trayCustomerCode
        ? `tray:customer:${trayCustomerCode}`
        : `tray:order-customer:${trayOrderCode}`;
    const phone = normalizeTrayPhone(clean(row["Celular"]) ?? clean(row["Telefone"]));
    const city = clean(row["Cidade"]);
    const province = clean(row["Estado"]);
    const { firstName, lastName } = splitName(clean(row["Nome do Cliente"]));
    const paymentDateIso = dateTimeIso(row["Pagamento data"], "12:00:00");
    const shippingDateIso = dateTimeIso(row["Envio data"], "12:00:00");
    const updatedAt = laterIso([createdAt, paymentDateIso, shippingDateIso]);
    const rawStatus = clean(row["Status pedido"]);

    orders.push({
      id: `tray:${trayOrderCode}`,
      orderNumber: `TRAY-${trayOrderCode}`,
      trayOrderCode,
      customerId,
      email,
      phone,
      createdAt,
      processedAt: createdAt,
      updatedAt,
      financialStatus: trayStatusToFinancialStatus(rawStatus),
      fulfillmentStatus: trayStatusToFulfillmentStatus(rawStatus),
      subtotalPrice: parseBrazilianMoney(row["Subtotal produtos"]),
      totalDiscounts: parseBrazilianMoney(row["Desconto"]),
      totalShippingPrice: parseBrazilianMoney(row["Frete valor"]),
      totalTax: parseBrazilianMoney(row["Impostos"]),
      totalPrice: parseBrazilianMoney(row["Total"]),
      city,
      province,
      country: "Brasil",
      paymentType: clean(row["Forma pagamento paga"]) ?? clean(row["Pagamento tipo"]),
      paymentDate: clean(row["Pagamento data"]),
      shippingType: clean(row["Frete tipo"]),
      coupon: clean(row["Cupom desconto"]),
      utmSource: clean(row["UTM Source"]),
      rawStatus,
      channel: clean(row["Canal de venda"]),
      trayCustomerCode,
    });
    orderCodes.add(trayOrderCode);

    const existing = customers.get(customerId);
    if (!existing) {
      customers.set(customerId, {
        id: customerId,
        email,
        firstName,
        lastName,
        phone,
        city,
        province,
        country: "Brasil",
        firstOrderAt: createdAt,
        lastOrderAt: updatedAt,
      });
      continue;
    }

    if (new Date(createdAt).getTime() < new Date(existing.firstOrderAt).getTime()) existing.firstOrderAt = createdAt;
    if (new Date(updatedAt).getTime() > new Date(existing.lastOrderAt).getTime()) existing.lastOrderAt = updatedAt;
    existing.email ||= email;
    existing.firstName ||= firstName;
    existing.lastName ||= lastName;
    existing.phone ||= phone;
    existing.city ||= city;
    existing.province ||= province;
  }

  orders.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const items: TrayImportItem[] = [];
  const duplicateCounter = new Map<string, number>();
  const itemTotalsByOrder = new Map<string, number>();
  const itemCountByOrder = new Map<string, number>();
  let unmatchedItemCount = 0;
  let unitCount = 0;

  for (const row of itemRows) {
    const trayOrderCode = String(row["Código pedido"] ?? "").trim();
    if (!trayOrderCode || !orderCodes.has(trayOrderCode)) {
      unmatchedItemCount += 1;
      continue;
    }

    const trayProductCode = String(row["Código produto"] ?? "").trim() || "sem-codigo";
    const duplicateKey = `${trayOrderCode}:${trayProductCode}`;
    const sequence = (duplicateCounter.get(duplicateKey) ?? 0) + 1;
    duplicateCounter.set(duplicateKey, sequence);
    const parsedQuantity = Number(String(row["Quantidade"] ?? "0").replace(",", "."));
    const quantity = Number.isFinite(parsedQuantity) ? Math.max(0, Math.trunc(parsedQuantity)) : 0;
    const price = parseBrazilianMoney(row["Preço venda"]);
    const sku = clean(row["Referência"]) ?? (trayProductCode !== "sem-codigo" ? `TRAY-${trayProductCode}` : null);

    items.push({
      id: `tray:${trayOrderCode}:${trayProductCode}:${sequence}`,
      orderId: `tray:${trayOrderCode}`,
      trayOrderCode,
      trayProductCode,
      productId: `tray:${trayProductCode}`,
      sku,
      title: cleanProductTitle(row["Nome produto"]),
      quantity,
      price,
      totalDiscount: 0,
    });

    itemTotalsByOrder.set(trayOrderCode, (itemTotalsByOrder.get(trayOrderCode) ?? 0) + price * quantity);
    itemCountByOrder.set(trayOrderCode, (itemCountByOrder.get(trayOrderCode) ?? 0) + 1);
    unitCount += quantity;
  }

  const ordersWithoutItems = orders.filter((order) => !itemCountByOrder.has(order.trayOrderCode)).length;
  const subtotalMismatchCount = orders.filter((order) => {
    const itemTotal = itemTotalsByOrder.get(order.trayOrderCode);
    if (itemTotal == null) return false;
    return Math.abs(order.subtotalPrice - itemTotal) > 0.02;
  }).length;

  const warnings: string[] = [];
  if (unmatchedItemCount > 0) warnings.push(`${unmatchedItemCount} linha(s) de produto não encontraram o pedido correspondente.`);
  if (ordersWithoutItems > 0) warnings.push(`${ordersWithoutItems} pedido(s) não possuem itens no arquivo de produtos.`);
  if (subtotalMismatchCount > 0) warnings.push(`${subtotalMismatchCount} pedido(s) possuem diferença entre subtotal e soma dos itens.`);

  const paidOrderCount = orders.filter((order) => order.financialStatus === "PAID").length;
  const cancelledOrderCount = orders.filter((order) => order.financialStatus === "CANCELLED").length;
  const pendingOrderCount = orders.filter((order) => order.financialStatus === "PENDING").length;

  return {
    customers: [...customers.values()],
    orders,
    items,
    stats: {
      orderCount: orders.length,
      itemLineCount: items.length,
      unitCount,
      customerCount: customers.size,
      paidOrderCount,
      cancelledOrderCount,
      pendingOrderCount,
      unmatchedItemCount,
      ordersWithoutItems,
      subtotalMismatchCount,
      periodStart: orders.at(0)?.createdAt ?? null,
      periodEnd: orders.at(-1)?.createdAt ?? null,
    },
    warnings,
  };
}
