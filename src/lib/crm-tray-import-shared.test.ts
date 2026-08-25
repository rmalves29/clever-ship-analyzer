import { describe, expect, it } from "vitest";
import {
  buildTrayImportDataset,
  normalizeTrayPhone,
  parseBrazilianMoney,
  parseTrayCsvText,
  trayStatusToFinancialStatus,
} from "./crm-tray-import-shared";

describe("crm-tray-import-shared", () => {
  it("interpreta valores, telefones e status da Tray", () => {
    expect(parseBrazilianMoney("1.234,56")).toBe(1234.56);
    expect(normalizeTrayPhone("(31) 99999-8888")).toBe("+5531999998888");
    expect(trayStatusToFinancialStatus("PEDIDO EM PRODUÇÃO")).toBe("PAID");
    expect(trayStatusToFinancialStatus("CANCELADO AUT")).toBe("CANCELLED");
    expect(trayStatusToFinancialStatus("AGUARDANDO PIX")).toBe("PENDING");
    expect(trayStatusToFinancialStatus("")).toBe("PENDING");
  });

  it("lê CSV separado por ponto e vírgula respeitando campos entre aspas", () => {
    const rows = parseTrayCsvText('"Pedido";"Nome";"Observação"\r\n"100";"Maria";"texto; com separador"\r\n');
    expect(rows).toEqual([{ Pedido: "100", Nome: "Maria", Observação: "texto; com separador" }]);
  });

  it("une pedidos e itens pelo código do pedido sem duplicar o cliente", () => {
    const orderCsv = [
      '"Pedido";"Data";"Hora";"Nome do Cliente";"Email";"Telefone";"Celular";"Subtotal produtos";"Impostos";"Canal de venda";"Frete tipo";"Frete valor";"Pagamento tipo";"Pagamento data";"Envio data";"Status pedido";"Cupom desconto";"Desconto";"Total";"Forma pagamento paga";"Código cliente";"Cidade";"Estado";"UTM Source"',
      '"100";"17/08/2026";"00:03:59";"Maria Silva";"MARIA@EXAMPLE.COM";;"31999998888";"100,00";"0,00";"LOJA VIRTUAL";"SEDEX";"20,00";"Pix - Vindi";"17/08/2026";"18/08/2026";"FINALIZADO";;"0,00";"120,00";"Pix - Vindi";"77";"Belo Horizonte";"MG";"facebook"',
      '"101";"18/08/2026";"10:10:10";"Maria Silva";"maria@example.com";;"31999998888";"50,00";"0,00";"LOJA VIRTUAL";"PAC";"0,00";"Pix - Vindi";;;"CANCELADO";;"0,00";"50,00";;"77";"Belo Horizonte";"MG";"instagram"',
    ].join("\r\n");

    const itemCsv = [
      '"Código produto";"Código pedido";"Nome produto";"Preço venda";"Quantidade";"Referência"',
      '"10";"100";"Colar Teste (Disponibilidade: Disponível em 3 dias úteis) ";"40,00";"2";"COL-10"',
      '"11";"100";"Brinco Teste";"20,00";"1";"BRI-11"',
      '"12";"101";"Pulseira Teste";"50,00";"1";""',
    ].join("\r\n");

    const dataset = buildTrayImportDataset(parseTrayCsvText(orderCsv), parseTrayCsvText(itemCsv));
    const customer = dataset.customers.at(0);
    const firstOrder = dataset.orders.at(0);
    const firstItem = dataset.items.at(0);
    const thirdItem = dataset.items.at(2);

    expect(customer).toBeDefined();
    expect(firstOrder).toBeDefined();
    expect(firstItem).toBeDefined();
    expect(thirdItem).toBeDefined();
    if (!customer || !firstOrder || !firstItem || !thirdItem) throw new Error("Dataset Tray incompleto no teste.");

    expect(dataset.stats.orderCount).toBe(2);
    expect(dataset.stats.customerCount).toBe(1);
    expect(dataset.stats.itemLineCount).toBe(3);
    expect(dataset.stats.unitCount).toBe(4);
    expect(dataset.stats.paidOrderCount).toBe(1);
    expect(dataset.stats.cancelledOrderCount).toBe(1);
    expect(dataset.stats.pendingOrderCount).toBe(0);
    expect(dataset.stats.unmatchedItemCount).toBe(0);
    expect(dataset.stats.ordersWithoutItems).toBe(0);
    expect(dataset.stats.subtotalMismatchCount).toBe(0);
    expect(customer.id).toBe("email:maria@example.com");
    expect(customer.phone).toBe("+5531999998888");
    expect(firstOrder.id).toBe("tray:100");
    expect(firstOrder.financialStatus).toBe("PAID");
    expect(firstItem).toMatchObject({
      id: "tray:100:10:1",
      orderId: "tray:100",
      productId: "tray:10",
      sku: "COL-10",
      title: "Colar Teste",
      quantity: 2,
      price: 40,
    });
    expect(thirdItem.sku).toBe("TRAY-12");
    expect(dataset.warnings).toEqual([]);
  });
});
