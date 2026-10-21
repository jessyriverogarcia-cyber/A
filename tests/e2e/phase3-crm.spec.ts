import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL(new RegExp(next.replace(/\//g, "\\/")));
}

test("à faire aujourd'hui : relance pré-remplie en un clic", async ({ page }) => {
  await login(page, "commercial", "/crm");
  const tiles = page.getByTestId("todo-tiles");
  await expect(tiles).toContainText("Devis à relancer");
  const btn = tiles.locator("[data-testid^=followup-]").first();
  await btn.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("textarea")).toHaveValue(/Je reviens vers vous au sujet de notre devis/);
  await page.screenshot({ path: "test-results/screens/20-crm-relance.png" });
  await dialog.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("flash")).toContainText("Relance envoyée (simulation)");
  await page.screenshot({ path: "test-results/screens/21-crm-todo.png", fullPage: true });
});

test("client → devis → envoi → PDF → accepté → ordre de fabrication", async ({ page }) => {
  await login(page, "commercial", "/crm/clients/new");
  await page.getByTestId("client-name").fill("Aéro Test Fictif");
  await page.getByTestId("contact-first").fill("Jeanne");
  await page.getByTestId("contact-last").fill("Essai");
  await page.getByTestId("contact-email").fill("jeanne.essai@client.test");
  await page.getByTestId("client-submit").click();
  await expect(page.getByTestId("flash")).toContainText("Client créé");

  await page.getByTestId("new-quote").click();
  await page.waitForURL(/\/crm\/quotes\/[0-9a-f-]{36}/);
  const picker = page.getByTestId("catalog-picker");
  await picker.selectOption({ index: 1 });
  await picker.selectOption({ index: 3 });
  await expect(page.getByTestId("quote-line")).toHaveCount(2);
  await page.getByTestId("line-qty").first().fill("10");
  await expect(page.getByTestId("total-ht")).not.toHaveText("0,00 €");
  await page.getByTestId("save-quote").click();
  await expect(page.getByTestId("save-quote")).toHaveText("Enregistré ✓");
  await page.screenshot({ path: "test-results/screens/22-crm-quote-editor.png", fullPage: true });

  await page.getByTestId("send-quote").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toContainText("jeanne.essai@client.test");
  await expect(dialog.locator("textarea")).toHaveValue(/Bonjour Jeanne,/);
  await dialog.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("quote-status")).toHaveText("Envoyé");

  const pdf = await page.request.get(page.url().split("?")[0] + "/pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  page.once("dialog", (d) => d.accept());
  await page.getByTestId("accept-quote").click();
  await expect(page.getByTestId("quote-status")).toHaveText("Accepté");
  await expect(page.getByTestId("quote-wo")).toContainText(/OF-\d{4}-\d{4}/);
  await page.screenshot({ path: "test-results/screens/23-crm-quote-accepted.png", fullPage: true });
});

test("pipeline : changer l'étape d'une affaire (persistant)", async ({ page }) => {
  await login(page, "commercial", "/crm/pipeline");
  const card = page.getByTestId("col-lead").locator("article").first();
  const id = (await card.getAttribute("data-testid"))!.replace("deal-", "");
  await page.getByTestId(`deal-stage-${id}`).selectOption("qualified");
  await expect(page.getByTestId("col-qualified").getByTestId(`deal-${id}`)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("col-qualified").getByTestId(`deal-${id}`)).toBeVisible();
  await page.screenshot({ path: "test-results/screens/24-crm-pipeline.png", fullPage: true });
});

test("opérateur : pas d'accès au Commercial", async ({ page }) => {
  await login(page, "operateur", "/crm");
  await expect(page.getByText("Module Commercial non accessible")).toBeVisible();
});
