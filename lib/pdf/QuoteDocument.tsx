import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { sectorConfig } from "@/config/sector.config";

/** Helvetica (police PDF standard) ne connaît pas les espaces fines de Intl fr-FR. */
const clean = (s: string) => s.replace(/[  ]/g, " ");
const fmt = new Intl.NumberFormat(sectorConfig.company.locale, { style: "currency", currency: sectorConfig.company.currency });
const money = (n: number | string) => clean(fmt.format(Number(n)));
const num = (n: number | string) => clean(new Intl.NumberFormat(sectorConfig.company.locale, { maximumFractionDigits: 3 }).format(Number(n)));
const date = (d: string | null) => (d ? clean(new Intl.DateTimeFormat(sectorConfig.company.locale, { dateStyle: "long" }).format(new Date(d))) : "—");
const accent = sectorConfig.company.accentColor;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9.5, fontFamily: "Helvetica", color: "#1f2937" },
  row: { flexDirection: "row" },
  logo: { width: 34, height: 34, borderRadius: 8, backgroundColor: accent, color: "white", fontSize: 14, fontFamily: "Helvetica-Bold", textAlign: "center", paddingTop: 9 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  muted: { color: "#6b7280" },
  box: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, padding: 10 },
  th: { fontFamily: "Helvetica-Bold", color: "#6b7280", fontSize: 8, paddingVertical: 6 },
  td: { paddingVertical: 6 },
  line: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

export interface QuotePdfData {
  number: string;
  issue_date: string;
  valid_until: string | null;
  title: string;
  notes: string | null;
  total_ht: number;
  total_vat: number;
  total_ttc: number;
  client: { name: string; city: string | null; vat_number: string | null; address: string | null };
  contact: { first_name: string; last_name: string; email: string | null } | null;
  lines: { description: string; quantity: number; unit_price: number; discount: number; unit?: string }[];
}

const cols = [
  { key: "desc", w: "48%" },
  { key: "qty", w: "10%", right: true },
  { key: "pu", w: "16%", right: true },
  { key: "disc", w: "10%", right: true },
  { key: "total", w: "16%", right: true },
] as const;

export function QuoteDocument({ q }: { q: QuotePdfData }) {
  const c = sectorConfig.company;
  return (
    <Document title={`${q.number} — ${c.name}`} author={c.name}>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 28 }]}>
          <View style={[s.row, { gap: 10 }]}>
            <Text style={s.logo}>{c.logo.value}</Text>
            <View>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>{c.name}</Text>
              <Text style={s.muted}>{c.legal.address}</Text>
              <Text style={s.muted}>{c.legal.email} · {c.legal.phone}</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>DEVIS</Text>
            <Text>N° {q.number}</Text>
            <Text style={s.muted}>Émis le {date(q.issue_date)}</Text>
            <Text style={s.muted}>Valable jusqu&apos;au {date(q.valid_until)}</Text>
          </View>
        </View>

        <View style={[s.row, { gap: 16, marginBottom: 20 }]}>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.muted, { fontSize: 8, marginBottom: 4 }]}>OBJET</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{q.title}</Text>
          </View>
          <View style={[s.box, { flex: 1 }]}>
            <Text style={[s.muted, { fontSize: 8, marginBottom: 4 }]}>CLIENT</Text>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{q.client.name}</Text>
            {q.contact && <Text>À l&apos;attention de {q.contact.first_name} {q.contact.last_name}</Text>}
            {q.client.address && <Text>{q.client.address}</Text>}
            {q.client.city && <Text>{q.client.city}</Text>}
            {q.client.vat_number && <Text style={s.muted}>TVA : {q.client.vat_number}</Text>}
          </View>
        </View>

        <View style={[s.row, s.line, { borderBottomColor: "#e5e7eb" }]}>
          {["Désignation", "Qté", "PU HT", "Remise", "Total HT"].map((h, i) => (
            <Text key={h} style={[s.th, { width: cols[i].w, textAlign: "right" in cols[i] ? "right" : "left" }]}>{h}</Text>
          ))}
        </View>
        {q.lines.map((l, i) => {
          const total = l.quantity * l.unit_price * (1 - l.discount);
          return (
            <View key={i} style={[s.row, s.line]} wrap={false}>
              <Text style={[s.td, { width: cols[0].w, paddingRight: 8 }]}>{l.description}</Text>
              <Text style={[s.td, { width: cols[1].w, textAlign: "right" }]}>{num(l.quantity)}{l.unit ? ` ${l.unit}` : ""}</Text>
              <Text style={[s.td, { width: cols[2].w, textAlign: "right" }]}>{money(l.unit_price)}</Text>
              <Text style={[s.td, { width: cols[3].w, textAlign: "right" }]}>{l.discount ? `${num(l.discount * 100)} %` : "—"}</Text>
              <Text style={[s.td, { width: cols[4].w, textAlign: "right" }]}>{money(total)}</Text>
            </View>
          );
        })}

        <View style={[s.row, { justifyContent: "space-between", marginTop: 16 }]}>
          <View style={{ width: "50%" }}>
            {q.notes && (
              <>
                <Text style={[s.muted, { fontSize: 8, marginBottom: 3 }]}>CONDITIONS PARTICULIÈRES</Text>
                <Text>{q.notes}</Text>
              </>
            )}
          </View>
          <View style={{ width: "38%" }}>
            <View style={s.totalRow}><Text style={s.muted}>Total HT</Text><Text>{money(q.total_ht)}</Text></View>
            <View style={s.totalRow}><Text style={s.muted}>TVA {num(c.vatRate * 100)} %</Text><Text>{money(q.total_vat)}</Text></View>
            <View style={[s.totalRow, { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 3, paddingTop: 6 }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>Total TTC</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color: accent }}>{money(q.total_ttc)}</Text>
            </View>
          </View>
        </View>

        <View style={[s.box, { marginTop: 24 }]}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Bon pour accord</Text>
          <Text style={s.muted}>
            Date, signature et cachet du client, précédés de la mention « bon pour accord ». Paiement à {sectorConfig.crm.paymentTermsDays} jours à réception de facture.
            En cas de retard, pénalités au taux légal majoré et indemnité forfaitaire de 40 € pour frais de recouvrement.
          </Text>
          <View style={{ height: 50 }} />
        </View>

        <Text style={s.footer} fixed>
          {c.name} · {c.legal.registration} · TVA {c.legal.vatNumber} — Document de démonstration, données fictives.
        </Text>
      </Page>
    </Document>
  );
}
