/**
 * Factur-X : XML CII (UN/CEFACT Cross Industry Invoice), profil EN 16931, à joindre au PDF.
 * Fonctions pures, testées. Les montants sont recalculés ici et contrôlés par les tests.
 */

export interface FxParty {
  name: string;
  address?: string | null; // « 12 rue …, 33000 Ville »
  country?: string | null;
  vatNumber?: string | null;
  siren?: string | null;
}

export interface FxLine {
  description: string;
  quantity: number;
  unitPrice: number; // HT, remise déduite
  vatRate: number; // 0.2
}

export interface FxInvoice {
  number: string;
  kind: "invoice" | "deposit" | "credit_note";
  issueDate: string; // AAAA-MM-JJ
  dueDate?: string | null;
  currency: string;
  seller: FxParty;
  buyer: FxParty;
  lines: FxLine[];
  paidAmount?: number;
  iban?: string | null;
  note?: string | null;
  orderReference?: string | null;
}

export const PROFILE_EN16931 = "urn:cen.eu:en16931:2017";
/** Codes UNTDID 1001 : facture, avoir, facture d'acompte. */
export const TYPE_CODE = { invoice: "380", credit_note: "381", deposit: "386" } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const d8 = (iso: string) => iso.slice(0, 10).replace(/-/g, "");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** « 12 rue des Fictions, 33000 Bordeaux » → ligne, code postal, ville. */
export function splitAddress(a?: string | null) {
  const m = (a ?? "").match(/^(.*?),?\s*(\d{5})\s+(.+)$/);
  return m ? { line: m[1].trim(), postcode: m[2], city: m[3].trim() } : { line: a ?? "", postcode: "", city: "" };
}

/** Totaux par taux de TVA et totaux du document (BT-106 à BT-115). */
export function fxTotals(lines: FxLine[], paid = 0) {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.vatRate, r2((byRate.get(l.vatRate) ?? 0) + r2(l.quantity * l.unitPrice)));
  const vat = [...byRate.entries()].map(([rate, base]) => ({ rate, base, tax: r2(base * rate) }));
  const lineTotal = r2(vat.reduce((s, v) => s + v.base, 0));
  const taxTotal = r2(vat.reduce((s, v) => s + v.tax, 0));
  const grand = r2(lineTotal + taxTotal);
  return { vat, lineTotal, taxTotal, grand, due: r2(grand - paid) };
}

function party(tag: string, p: FxParty) {
  const a = splitAddress(p.address);
  return `<ram:${tag}>
      <ram:Name>${esc(p.name)}</ram:Name>${p.siren ? `
      <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(p.siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}
      <ram:PostalTradeAddress>
        <ram:PostcodeCode>${esc(a.postcode)}</ram:PostcodeCode>
        <ram:LineOne>${esc(a.line)}</ram:LineOne>
        <ram:CityName>${esc(a.city)}</ram:CityName>
        <ram:CountryID>${esc(p.country ?? "FR")}</ram:CountryID>
      </ram:PostalTradeAddress>${p.vatNumber ? `
      <ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(p.vatNumber.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
    </ram:${tag}>`;
}

export function buildCiiXml(inv: FxInvoice): string {
  const t = fxTotals(inv.lines, inv.paidAmount ?? 0);
  const lines = inv.lines
    .map(
      (l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.description)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(l.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${l.quantity}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.vatRate > 0 ? "S" : "Z"}</ram:CategoryCode><ram:RateApplicablePercent>${amt(l.vatRate * 100)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(l.quantity * l.unitPrice)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join("");
  const taxes = t.vat
    .map(
      (v) => `
      <ram:ApplicableTradeTax><ram:CalculatedAmount>${amt(v.tax)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>${amt(v.base)}</ram:BasisAmount><ram:CategoryCode>${v.rate > 0 ? "S" : "Z"}</ram:CategoryCode><ram:RateApplicablePercent>${amt(v.rate * 100)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${PROFILE_EN16931}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${TYPE_CODE[inv.kind]}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d8(inv.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${inv.note ? `
    <ram:IncludedNote><ram:Content>${esc(inv.note)}</ram:Content></ram:IncludedNote>` : ""}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
    ${party("SellerTradeParty", inv.seller)}
    ${party("BuyerTradeParty", inv.buyer)}${inv.orderReference ? `
      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(inv.orderReference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ""}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(inv.currency)}</ram:InvoiceCurrencyCode>${inv.iban ? `
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(inv.iban.replace(/\s/g, ""))}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ""}${taxes}${inv.dueDate ? `
      <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${d8(inv.dueDate)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>` : ""}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(t.lineTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(t.lineTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(inv.currency)}">${amt(t.taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(t.grand)}</ram:GrandTotalAmount>
        <ram:TotalPrepaidAmount>${amt(inv.paidAmount ?? 0)}</ram:TotalPrepaidAmount>
        <ram:DuePayableAmount>${amt(t.due)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
