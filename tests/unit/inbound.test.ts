import { describe, expect, it } from "vitest";
import { cleanBody, fromGmail, fromGraph, matchSender, threadSubject } from "@/lib/domain/inbound";

describe("e-mails entrants", () => {
  it("normalise un message Graph", () => {
    const m = fromGraph({ id: "AAA", subject: "RE: Devis DEV-2026-0007", receivedDateTime: "2026-10-21T08:00:00Z", from: { emailAddress: { address: "Claire.Dumas@Client.test", name: "Claire Dumas" } }, body: { content: "Bonjour,\nOK pour nous.\n\nLe 20 oct. 2026, Karim a écrit :\n> ancien message" } });
    expect(m).toEqual({ externalId: "ms:AAA", from: "claire.dumas@client.test", fromName: "Claire Dumas", subject: "RE: Devis DEV-2026-0007", text: "Bonjour,\nOK pour nous.", receivedAt: "2026-10-21T08:00:00.000Z" });
  });

  it("normalise un message Gmail multipart (texte brut extrait)", () => {
    const data = Buffer.from("Bonjour, quel délai ?\n\nOn Tue, Oct 20, 2026 Karim wrote:\n> x").toString("base64url");
    const m = fromGmail({ id: "g1", internalDate: String(Date.parse("2026-10-21T09:30:00Z")), payload: { headers: [{ name: "From", value: '"Paul Martin" <paul@fournisseur.test>' }, { name: "Subject", value: "Re: Commande CMD-2026-0031" }], parts: [{ mimeType: "text/html", body: { data: "PGI+" } }, { mimeType: "text/plain", body: { data } }] } });
    expect(m).toMatchObject({ externalId: "gm:g1", from: "paul@fournisseur.test", fromName: "Paul Martin", text: "Bonjour, quel délai ?" });
  });

  it("retrouve le fil et l'expéditeur connu ; ignore les inconnus", () => {
    expect(threadSubject("RE: TR : Fwd: Devis DEV-1")).toBe("Devis DEV-1");
    const contacts = [{ email: "claire.dumas@client.test", client_id: "c1" }];
    const suppliers = [{ id: "s1", email: "orders@metal.test" }];
    expect(matchSender("claire.dumas@client.test", contacts, suppliers)).toEqual({ kind: "client", clientId: "c1", supplierId: null });
    expect(matchSender("orders@metal.test", contacts, suppliers)).toEqual({ kind: "supplier", clientId: null, supplierId: "s1" });
    expect(matchSender("newsletter@pub.test", contacts, suppliers)).toBeNull();
    expect(cleanBody("Texte\n-----Original Message-----\nancien")).toBe("Texte");
  });
});
