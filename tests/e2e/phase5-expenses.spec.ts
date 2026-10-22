import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.context().clearCookies();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("salarié : indemnités kilométriques et repas avec justificatif", async ({ page }) => {
  await login(page, "operateur", "/me");
  await page.getByTestId("expense-category").selectOption("mileage");
  await page.getByTestId("expense-label").fill("Livraison urgente Mérignac");
  await page.getByTestId("expense-km").fill("50");
  await expect(page.getByTestId("expense-preview")).toContainText("31,80");
  await page.getByTestId("expense-submit").click();
  await expect(page.getByTestId("flash")).toContainText("31,80");

  await page.getByTestId("expense-category").selectOption("meal");
  await page.getByTestId("expense-label").fill("Déjeuner chantier Hangar");
  await page.getByTestId("expense-amount").fill("18,50");
  await page.getByTestId("expense-receipt").setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 ticket") });
  await page.getByTestId("expense-submit").click();
  await expect(page.getByTestId("flash")).toContainText("18,50");
  const row = page.getByTestId("my-expenses").locator("li", { hasText: "Déjeuner chantier Hangar" });
  await expect(row).toContainText("À valider");
  const href = await row.getByRole("link", { name: "justificatif" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);
  await page.screenshot({ path: "test-results/screens/93-mes-frais.png", fullPage: true });
});

test("comptabilité : validation en lot, non-conformes écartées, remboursement", async ({ page }) => {
  await login(page, "compta", "/finance/expenses");
  // La note hors plafond sans justificatif n'est pas cochée d'office
  const dinner = page.getByTestId("expense-row").filter({ hasText: "Dîner équipe" });
  await expect(dinner).toContainText("au-dessus du plafond");
  await expect(dinner.locator("input[type=checkbox]")).not.toBeChecked();
  await expect(page.getByTestId("expense-row").filter({ hasText: "Livraison urgente Mérignac" }).locator("input[type=checkbox]")).toBeChecked();
  await page.screenshot({ path: "test-results/screens/94-notes-de-frais.png", fullPage: true });
  await page.getByTestId("expenses-approve").click();
  await expect(page.getByTestId("flash")).toContainText(/note\(s\) validée\(s\)/);
  await expect(page.getByTestId("expense-row").filter({ hasText: "Dîner équipe" })).toBeVisible();

  await page.goto("/finance/expenses?tab=approved");
  await expect(page.getByTestId("owed")).toContainText("Pauline");
  await page.getByTestId("expenses-reimburse").click();
  await expect(page.getByTestId("flash")).toContainText("remboursée");
});

test("zéro double saisie : variables de paie et refacturation au client", async ({ page }) => {
  execSync("pnpm db:seed", { stdio: "ignore" });
  await login(page, "rh", "/hr/payroll");
  await expect(page.locator("tr", { hasText: "Pauline" })).toContainText("74,50");

  // Frais validé et refacturable (taxi) repris sur la facture finale du dossier Héliance
  await login(page, "compta", "/ops/work-orders");
  await page.getByText("Conduits de climatisation cabine ULTEM").first().click();
  await page.getByTestId("wo-invoice").click();
  await page.waitForURL(/\/finance\/invoices\//);
  await expect(page.locator(`input[value^="Frais refacturés — Taxi aéroport"]`)).toHaveCount(1);
});

test("confidentialité : un justificatif n'est lisible que par son auteur et la comptabilité", async ({ page }) => {
  await login(page, "commercial", "/me");
  const href = await page.getByTestId("my-expenses").locator("li", { hasText: "Train Bordeaux" }).getByRole("link", { name: "justificatif" }).getAttribute("href");
  expect((await page.request.get(href!)).status()).toBe(200);
  await login(page, "production", "/dashboard");
  expect((await page.request.get(href!, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(400);
});
