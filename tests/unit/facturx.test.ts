import { describe, expect, it } from "vitest";
import { buildCiiXml, fxTotals, splitAddress } from "@/lib/domain/facturx";

const base = {
  number: "FAC-2026-0012",
  kind: "invoice" as const,
  issueDate: "2026-10-21",
  dueDate: "2026-11-20",
  currency: "EUR",
  seller: { name: "Strato Fab", address: "12 rue des Fictions, 33000 Bordeaux", vatNumber: "FR00 000000000", siren: "000000000" },
  buyer: { name: "Garonne Robotique & Fils", address: "4 quai <Sud>, 33100 Bordeaux", vatNumber: "FR11 111111111" },
  lines: [
    { description: "Pinces PA12-CF", quantity: 30, unitPrice: 42.5, vatRate: 0.2 },
    { description: "Dossier de traçabilité", quantity: 1, unitPrice: 250, vatRate: 0.2 },
  ],
  iban: "FR76 0000 0000 0000 0000 0000 000",
  paidAmount: 300,
};

describe("Factur-X (CII EN 16931)", () => {
  it("découpe une adresse française", () => {
    expect(splitAddress("12 rue des Fictions, 33000 Bordeaux")).toEqual({ line: "12 rue des Fictions", postcode: "33000", city: "Bordeaux" });
  });

  it("totaux par taux, net à payer après acompte", () => {
    expect(fxTotals(base.lines, 300)).toEqual({ vat: [{ rate: 0.2, base: 1525, tax: 305 }], lineTotal: 1525, taxTotal: 305, grand: 1830, due: 1530 });
  });

  it("XML : profil, type, dates au format 102, montants, échappement", () => {
    const x = buildCiiXml(base);
    expect(x).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(x).toContain("<ram:TypeCode>380</ram:TypeCode>");
    expect(x).toContain('<udt:DateTimeString format="102">20261021</udt:DateTimeString>');
    expect(x).toContain("<ram:GrandTotalAmount>1830.00</ram:GrandTotalAmount>");
    expect(x).toContain("<ram:DuePayableAmount>1530.00</ram:DuePayableAmount>");
    expect(x).toContain("Garonne Robotique &amp; Fils");
    expect(x).toContain("4 quai &lt;Sud&gt;");
    expect(x).toContain('<ram:ID schemeID="VA">FR00000000000</ram:ID>');
    expect(x).toContain("<ram:IBANID>FR7600000000000000000000000</ram:IBANID>");
    expect(x.match(/<ram:IncludedSupplyChainTradeLineItem>/g)).toHaveLength(2);
    expect(buildCiiXml({ ...base, kind: "credit_note" })).toContain("<ram:TypeCode>381</ram:TypeCode>");
  });
});

describe("Factur-X — règles de la réforme française", () => {
  it("mentions AAB / PMD / PMT, mode de facturation, adresses électroniques SIREN, date de livraison, pas d'élément vide", async () => {
    const { buildCiiXml, sirenFromVat } = await import("@/lib/domain/facturx");
    expect(sirenFromVat("FR12 345678901")).toBe("345678901");
    expect(sirenFromVat("DE123456789")).toBeNull();
    const x = buildCiiXml({
      number: "F1", kind: "invoice", issueDate: "2026-10-21", currency: "EUR", deliveryDate: "2026-10-20", invoicingMode: "M1",
      paymentNotes: { discount: "Pas d'escompte.", latePenalty: "Pénalités…", recoveryFee: "40 €." },
      seller: { name: "S", address: "1 rue A, 33000 Bordeaux", siren: "000000000" },
      buyer: { name: "C", address: null, city: "Toulouse", vatNumber: "FR12345678901" },
      lines: [{ description: "x", quantity: 1, unitPrice: 10, vatRate: 0.2 }],
    });
    expect(x).toContain("<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>M1</ram:ID>");
    for (const code of ["AAB", "PMD", "PMT"]) expect(x).toContain(`<ram:SubjectCode>${code}</ram:SubjectCode>`);
    expect(x).toContain('<ram:URIID schemeID="0225">000000000</ram:URIID>');
    expect(x).toContain('<ram:URIID schemeID="0225">345678901</ram:URIID>');
    expect(x).toContain("<ram:CityName>Toulouse</ram:CityName>");
    expect(x).toContain('<udt:DateTimeString format="102">20261020</udt:DateTimeString>');
    expect(x).not.toMatch(/<ram:(\w+)><\/ram:\1>|<ram:\w+\/>/);
  });
});
