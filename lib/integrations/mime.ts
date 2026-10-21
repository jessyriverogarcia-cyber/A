/** Construction d'un e-mail RFC 5322 (texte UTF-8, pièces jointes en base64) pour l'API Gmail. */

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const wrap = (b64: string) => b64.replace(/.{1,76}/g, (l) => l + "\r\n").trimEnd();

export function buildMime(m: { from?: string; to: string; subject: string; body: string; attachments?: { name: string; mime: string; data: Buffer }[] }) {
  const headers = [...(m.from ? [`From: ${m.from}`] : []), `To: ${m.to}`, `Subject: ${encodeHeader(m.subject)}`, "MIME-Version: 1.0"];
  const text = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap(Buffer.from(m.body, "utf8").toString("base64"))].join("\r\n");
  if (!m.attachments?.length) return [...headers, text].join("\r\n");
  const boundary = `sf_${Math.random().toString(36).slice(2)}`;
  const parts = [
    text,
    ...m.attachments.map((a) =>
      [`Content-Type: ${a.mime}; name="${encodeHeader(a.name)}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${encodeHeader(a.name)}"`, "", wrap(a.data.toString("base64"))].join("\r\n"),
    ),
  ];
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts.map((p) => `--${boundary}\r\n${p}`), `--${boundary}--`].join("\r\n");
}

export const base64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");
