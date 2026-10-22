import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

async function openWo(page: Page, text: string) {
  await page.goto("/ops/work-orders");
  await page.locator("[data-testid^=wo-card-]").filter({ hasText: text }).first().click();
  await page.waitForURL(/\/ops\/work-orders\/[0-9a-f-]{36}/);
}

test("relance de paiement pré-remplie en un clic", async ({ page }) => {
  await login(page, "compta", "/finance");
  const tiles = page.getByTestId("finance-tiles");
  await expect(tiles).toContainText("Retards à relancer");
  await tiles.locator("[data-testid^=dunning-]").first().click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("textarea")).toHaveValue(/Sauf erreur de notre part|Malgré notre précédent rappel/);
  await page.screenshot({ path: "test-results/screens/40-finance-relance.png" });
  await dialog.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("flash")).toContainText(/Relance niveau [12] envoyée \(simulation\)/);
  await page.screenshot({ path: "test-results/screens/41-finance-todo.png", fullPage: true });
});

test("dossier → facture reprise du devis → émise → PDF → paiements", async ({ page }) => {
  await login(page, "direction", "/ops/work-orders");
  await openWo(page, "Pinces de préhension");
  await page.getByTestId("wo-invoice").click();
  await page.waitForURL(/\/finance\/invoices\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("flash")).toContainText("Facture créée en brouillon");
  expect(await page.getByTestId("invoice-line").count()).toBeGreaterThanOrEqual(2);
  const ttc = await page.getByTestId("invoice-ttc").innerText();

  await page.getByTestId("send-invoice").click();
  await page.locator("dialog[open]").getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Émise");

  const pdf = await page.request.get(page.url().split("?")[0] + "/pdf");
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  await page.getByTestId("payment-amount").fill("100");
  await page.getByTestId("payment-submit").click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Payée en partie");
  await page.getByTestId("payment-submit").click(); // le reste dû est pré-rempli
  await expect(page.getByTestId("invoice-status")).toHaveText("Payée");
  await page.screenshot({ path: "test-results/screens/42-finance-invoice.png", fullPage: true });
  expect(ttc).toMatch(/€/);
});

test("acompte puis facture finale qui le déduit", async ({ page }) => {
  await login(page, "direction", "/ops/work-orders");
  await openWo(page, "Aubes de turbine");
  const woUrl = page.url();
  await page.getByTestId("wo-deposit").click();
  await page.waitForURL(/\/finance\/invoices\//);
  await expect(page.getByTestId("invoice-line")).toHaveCount(1);
  await expect(page.getByTestId("invoice-line").locator("input").first()).toHaveValue(/Acompte 30 %/);
  await page.getByTestId("send-invoice").click();
  await page.locator("dialog[open]").getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("invoice-status")).toHaveText("Émise");

  await page.goto(woUrl);
  await page.getByTestId("wo-invoice").click();
  await page.waitForURL(/\/finance\/invoices\//);
  const descs = await page.getByTestId("invoice-line").locator("input:first-child").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(descs.some((d) => d.startsWith("Déduction acompte"))).toBe(true);
});

test("droits : le commercial lit sans facturer, l'opérateur n'accède pas", async ({ page }) => {
  await login(page, "commercial", "/ops/work-orders");
  await openWo(page, "Carters de capteurs");
  await expect(page.getByTestId("wo-invoice")).toHaveCount(0);
  await page.goto("/finance/cash");
  await expect(page.getByTestId("cash-chart")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/43-finance-cash.png", fullPage: true });

  await page.context().clearCookies();
  await login(page, "operateur", "/finance");
  await expect(page.getByText("Module Finance non accessible")).toBeVisible();
});
