/**
 * Factur-X : XML CII (UN/CEFACT Cross Industry Invoice), profil EN 16931, à joindre au PDF.
 * Fonctions pures, testées. Les montants sont recalculés ici et contrôlés par les tests.
 */

export interface FxParty {
  name: string;
  address?: string | null; // « 12 rue …, 33000 Ville »
  city?: string | null; // si l'adresse ne contient pas la ville
  country?: string | null;
  vatNumber?: string | null;
  siren?: string | null;
}

/** SIREN déduit d'un numéro de TVA français (FR + clé + SIREN). */
export const sirenFromVat = (vat?: string | null) => (vat ?? "").replace(/\s/g, "").match(/^FR[0-9A-Z]{2}(\d{9})$/)?.[1] ?? null;

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
  /** Date de livraison ou de réalisation de la prestation (BT-72). */
  deliveryDate?: string | null;
  /** Mentions de paiement obligatoires (BT-22, codes AAB / PMD / PMT). */
  paymentNotes?: { discount: string; latePenalty: string; recoveryFee: string };
  /** Cadre de facturation de la réforme française (BT-23). */
  invoicingMode?: string;
  /** Facture corrigée par un avoir (BG-3). */
  precedingInvoice?: { number: string; issueDate: string } | null;
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
  if (!a.city && p.city) a.city = p.city;
  const siren = p.siren ?? sirenFromVat(p.vatNumber);
  const el = (name: string, v: string) => (v ? `\n        <ram:${name}>${esc(v)}</ram:${name}>` : ""); // pas d'élément vide
  return `<ram:${tag}>
      <ram:Name>${esc(p.name)}</ram:Name>${siren ? `
      <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}
      <ram:PostalTradeAddress>${el("PostcodeCode", a.postcode)}${el("LineOne", a.line)}${el("CityName", a.city)}
        <ram:CountryID>${esc(p.country ?? "FR")}</ram:CountryID>
      </ram:PostalTradeAddress>${siren ? `
      <ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(siren)}</ram:URIID></ram:URIUniversalCommunication>` : ""}${p.vatNumber ? `
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
  <rsm:ExchangedDocumentContext>${inv.invoicingMode ? `
    <ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>${esc(inv.invoicingMode)}</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>` : ""}
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>${PROFILE_EN16931}</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${TYPE_CODE[inv.kind]}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d8(inv.issueDate)}</udt:DateTimeString></ram:IssueDateTime>${inv.note ? `
    <ram:IncludedNote><ram:Content>${esc(inv.note)}</ram:Content></ram:IncludedNote>` : ""}${inv.paymentNotes ? `
    <ram:IncludedNote><ram:Content>${esc(inv.paymentNotes.discount)}</ram:Content><ram:SubjectCode>AAB</ram:SubjectCode></ram:IncludedNote>
    <ram:IncludedNote><ram:Content>${esc(inv.paymentNotes.latePenalty)}</ram:Content><ram:SubjectCode>PMD</ram:SubjectCode></ram:IncludedNote>
    <ram:IncludedNote><ram:Content>${esc(inv.paymentNotes.recoveryFee)}</ram:Content><ram:SubjectCode>PMT</ram:SubjectCode></ram:IncludedNote>` : ""}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
    ${party("SellerTradeParty", inv.seller)}
    ${party("BuyerTradeParty", inv.buyer)}${inv.orderReference ? `
      <ram:BuyerOrderReferencedDocument><ram:IssuerAssignedID>${esc(inv.orderReference)}</ram:IssuerAssignedID></ram:BuyerOrderReferencedDocument>` : ""}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${inv.deliveryDate ? `
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d8(inv.deliveryDate)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    ` : ""}</ram:ApplicableHeaderTradeDelivery>
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
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${inv.precedingInvoice ? `
      <ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${esc(inv.precedingInvoice.number)}</ram:IssuerAssignedID><ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${d8(inv.precedingInvoice.issueDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime></ram:InvoiceReferencedDocument>` : ""}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
