import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("Factur-X : XML CII cohérent avec la facture, joint au PDF", async ({ page }) => {
  await login(page, "compta", "/finance/invoices");
  await page.getByRole("link", { name: /FAC-\d{4}-\d+/ }).first().click();
  const total = (await page.getByText(/Total TTC/).locator("..").textContent()) ?? "";
  const xmlHref = await page.getByTestId("invoice-xml").getAttribute("href");
  const xml = await (await page.request.get(xmlHref!)).text();
  expect(xml).toContain("urn:cen.eu:en16931:2017");
  expect(xml).toMatch(/<ram:TypeCode>(380|386|381)<\/ram:TypeCode>/);
  const grand = xml.match(/<ram:GrandTotalAmount>([\d.]+)<\/ram:GrandTotalAmount>/)![1];
  expect(total.replace(/\s| |€/g, "").replace(",", ".")).toContain(Number(grand).toFixed(2));

  const pdf = Buffer.from(await (await page.request.get((await page.getByTestId("invoice-pdf").getAttribute("href"))!)).body());
  const raw = pdf.toString("latin1");
  expect(raw).toContain("factur-x.xml");
  expect(raw).toContain("/AFRelationship /Alternative");
  expect(raw).toContain("fx:ConformanceLevel");
});
