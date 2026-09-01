type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function addressList(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.map(asRecord);

  const connection = asRecord(value);
  if (Array.isArray(connection["nodes"])) return connection["nodes"].map(asRecord);
  if (Array.isArray(connection["edges"])) {
    return connection["edges"].map((edge) => asRecord(asRecord(edge)["node"]));
  }
  return [];
}

/** Normaliza telefones da Shopify e do WhatsApp para o mesmo formato E.164. */
export function normalizeShopifyPhone(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits) return null;

  if (
    raw.startsWith("+") ||
    (digits.startsWith("55") && (digits.length === 12 || digits.length === 13))
  ) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return digits.length >= 8 ? `+${digits}` : null;
}

/**
 * Reúne todos os telefones que podem identificar o titular do pedido.
 * Snapshots GraphQL (camelCase) e REST antigos (snake_case) são aceitos.
 */
export function extractShopifyOrderPhones(rawData: unknown, persistedPhone?: unknown): string[] {
  const order = asRecord(rawData);
  const customer = asRecord(order["customer"]);
  const shippingAddress = asRecord(order["shippingAddress"] ?? order["shipping_address"]);
  const billingAddress = asRecord(order["billingAddress"] ?? order["billing_address"]);
  const defaultAddress = asRecord(customer["defaultAddress"] ?? customer["default_address"]);
  const addresses = addressList(customer["addresses"]);

  const candidates = [
    shippingAddress["phone"],
    billingAddress["phone"],
    order["phone"],
    customer["phone"],
    defaultAddress["phone"],
    ...addresses.map((address) => address["phone"]),
    persistedPhone,
  ];

  return Array.from(
    new Set(
      candidates.map(normalizeShopifyPhone).filter((phone): phone is string => Boolean(phone)),
    ),
  );
}

export function getPrimaryShopifyOrderPhone(
  rawData: unknown,
  persistedPhone?: unknown,
): string | null {
  return extractShopifyOrderPhones(rawData, persistedPhone)[0] ?? null;
}
