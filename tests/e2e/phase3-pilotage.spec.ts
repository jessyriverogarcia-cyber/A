import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("direction : décisions à prendre, chiffres et graphiques", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "direction", "/pilotage");
  await expect(page.getByTestId("alerts")).toContainText("Important");
  await expect(page.getByTestId("alerts")).toContainText(/Facture FAC-\d{4}-\d+ échue/);
  await expect(page.getByTestId("finance-stats")).toContainText("Encours clients");
  await expect(page.getByTestId("crm-stats")).toContainText("Pipeline pondéré");
  await expect(page.getByTestId("chart-revenue").locator("path[d^='M']").first()).toBeVisible();
  // Info-bulle au survol d'une colonne
  await page.getByTestId("chart-cash").locator("rect[tabindex='0']").first().hover();
  await expect(page.getByTestId("chart-cash").getByRole("status")).toContainText("Encaissements");
  await page.screenshot({ path: "test-results/screens/80-pilotage.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("audit : une action d'utilisateur apparaît avec l'avant/après", async ({ page }) => {
  await login(page, "direction", "/pilotage/audit");
  const row = page.getByTestId("audit-row").filter({ hasText: "Marc Lestrade" });
  await expect(row).toContainText("Facture");
  await expect(row).toContainText("notes");

  // Action réelle : la direction déplace une affaire, puis la retrouve dans le journal
  await page.goto("/crm/pipeline");
  const card = page.getByTestId("col-lead").locator("article").first();
  const id = (await card.getAttribute("data-testid"))!.replace("deal-", "");
  await page.getByTestId(`deal-stage-${id}`).selectOption("qualified");
  await expect(page.getByTestId("col-qualified").getByTestId(`deal-${id}`)).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  await page.goto("/pilotage/audit?table=deals");
  const first = page.getByTestId("audit-row").first();
  await expect(first).toContainText("Claire");
  await expect(first).toContainText(/stage : lead → qualified/);
  await expect(page.getByTestId("audit-row").filter({ hasText: "Karim Ouali" })).toContainText("next_step");
  await page.screenshot({ path: "test-results/screens/81-audit.png", fullPage: true });

  const res = await page.request.get("/pilotage/audit/export");
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Modification");
});

test("production : pilotage sans la finance, journal filtré par la RLS", async ({ page }) => {
  await login(page, "production", "/pilotage");
  await expect(page.getByTestId("ops-stats")).toBeVisible();
  await expect(page.getByTestId("finance-stats")).toHaveCount(0);
  await page.goto("/pilotage/audit");
  await expect(page.getByTestId("audit-row").filter({ hasText: "Julien Ferrand" })).toBeVisible();
  await expect(page.getByTestId("audit-row").filter({ hasText: "Marc Lestrade" })).toHaveCount(0);
  const res = await page.request.get("/pilotage/audit/export");
  expect(res.status()).toBe(403);
});

test("ma journée : la file de travail du rôle", async ({ page }) => {
  await login(page, "commercial", "/dashboard");
  await expect(page.getByTestId("my-todo")).toContainText("Devis à relancer");
  await expect(page.getByTestId("my-todo")).not.toContainText("Congés à valider");
  await page.screenshot({ path: "test-results/screens/82-ma-journee.png", fullPage: true });
  await page.goto("/pilotage");
  await expect(page.getByText("Pilotage non accessible")).toBeVisible();
});
