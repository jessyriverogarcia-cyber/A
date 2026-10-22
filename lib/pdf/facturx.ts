import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AFRelationship, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { FACTURX_FILENAME } from "./facturx-name";

const PRODUCER = "Strato Fab — Map vivante (react-pdf, pdf-lib)";

/** Métadonnées XMP : identification PDF/A-3B, Factur-X (namespace fx), dates et titre identiques au dictionnaire Info. */
function xmp(title: string, date: string) {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title.replace(/[<&]/g, "")}</rdf:li></rdf:Alt></dc:title>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <xmp:CreateDate>${date}</xmp:CreateDate>
   <xmp:ModifyDate>${date}</xmp:ModifyDate>
   <xmp:CreatorTool>${PRODUCER}</xmp:CreatorTool>
   <pdf:Producer>${PRODUCER}</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>${FACTURX_FILENAME}</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
    <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
    <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
    <pdfaSchema:prefix>fx</pdfaSchema:prefix>
    <pdfaSchema:property><rdf:Seq>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Nom du fichier XML</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Version du schéma</pdfaProperty:description></rdf:li>
     <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>Profil Factur-X</pdfaProperty:description></rdf:li>
    </rdf:Seq></pdfaSchema:property>
   </rdf:li></rdf:Bag></pdfaExtension:schemas>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Facture électronique Factur-X : XML CII joint (relation « Alternative », entrée /AF du catalogue),
 * profil de couleur sRGB (OutputIntent), identification PDF/A-3B et métadonnées cohérentes.
 * Les polices sont incorporées par le gabarit (lib/pdf/fonts.ts). Vérifié avec veraPDF.
 */
export async function embedFacturX(pdf: Uint8Array, xml: string, title: string): Promise<Buffer> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await doc.attach(Buffer.from(xml, "utf8"), FACTURX_FILENAME, { mimeType: "text/xml", description: "Factur-X — facture structurée (CII, EN 16931)", afRelationship: AFRelationship.Alternative, creationDate: now, modificationDate: now });

  // Profil sRGB : rend les couleurs RVB du gabarit indépendantes du périphérique
  const icc = await readFile(path.join(process.cwd(), "assets", "icc", "sRGB_IEC61966_2_1.icc"));
  const iccRef = doc.context.register(doc.context.flateStream(icc, { N: 3 }));
  const intent = doc.context.obj({ Type: "OutputIntent", S: "GTS_PDFA1", OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"), Info: PDFString.of("sRGB IEC61966-2.1"), DestOutputProfile: iccRef });
  doc.catalog.set(PDFName.of("OutputIntents"), doc.context.obj([doc.context.register(intent)]));

  // Info et XMP strictement identiques
  doc.setTitle(title);
  doc.setProducer(PRODUCER);
  doc.setCreator(PRODUCER);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
  const meta = doc.context.stream(xmp(title, now.toISOString().replace(/\.\d{3}Z$/, "Z")), { Type: "Metadata", Subtype: "XML" });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(meta));
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
