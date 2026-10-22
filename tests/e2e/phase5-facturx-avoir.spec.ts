import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("avoir : facture électronique de type 381 en montants positifs, avec la facture corrigée", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "compta", "/finance/invoices");
  const link = page.locator("tr", { hasText: "En retard" }).first().getByRole("link", { name: /FAC-\d{4}-\d+/ });
  const original = (await link.textContent())!.match(/FAC-\d{4}-\d+/)![0];
  await link.click();
  await page.waitForURL(/\/finance\/invoices\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Créer un avoir" }).click();
  await expect(page.getByTestId("flash")).toContainText("Avoir créé");
  await page.getByTestId("send-invoice").click();
  await page.locator("dialog[open]").getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("flash")).toBeVisible();
  const xml = await (await page.request.get((await page.getByTestId("invoice-xml").getAttribute("href"))!)).text();
  expect(xml).toContain("<ram:TypeCode>381</ram:TypeCode>");
  expect(xml).toContain(`<ram:IssuerAssignedID>${original}</ram:IssuerAssignedID>`);
  expect(xml).not.toMatch(/<ram:GrandTotalAmount>-/);
  writeFileSync("test-results/avoir-factur-x.xml", xml);
});
