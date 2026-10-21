import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

async function openStock(page: Page, label: string) {
  await page.goto("/resources/stock");
  await page.getByRole("link", { name: label, exact: true }).click();
  await page.waitForURL(/\/resources\/stock\/[0-9a-f-]{36}/);
}

test("à faire : réassort, commandes en route, maintenances", async ({ page }) => {
  await login(page, "production", "/resources");
  const tiles = page.getByTestId("resources-tiles");
  await expect(tiles).toContainText("Filament PA12 fibre de carbone");
  await expect(tiles).not.toContainText("Poudre AlSi10Mg"); // déjà en commande
  await expect(tiles).toContainText("FDM-03");
  await page.screenshot({ path: "test-results/screens/50-resources-todo.png", fullPage: true });
});

test("réassort en un clic → envoi → réception → stock remis à niveau", async ({ page }) => {
  await login(page, "production", "/resources/stock");
  await openStock(page, "Résine biocompatible classe IIa");
  await expect(page.getByTestId("stock-level")).toHaveText("Sous le minimum");
  const before = Number((await page.getByTestId("stock-qty").innerText()).replace(/[^\d,]/g, "").replace(",", "."));
  await page.getByTestId("reorder-item").click();
  await page.waitForURL(/\/resources\/purchase-orders\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("flash")).toContainText("Bon de commande pré-rempli");
  await expect(page.getByTestId("po-line")).toHaveCount(1);
  await page.getByTestId("po-qty").fill("10");
  await page.getByTestId("po-save").click();
  await expect(page.getByTestId("flash")).toContainText("Commande mise à jour");

  await page.getByTestId("send-po").click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.locator("textarea")).toHaveValue(/• Résine biocompatible classe IIa : 10 L/);
  await dialog.getByRole("button", { name: "Envoyer" }).click();
  await expect(page.getByTestId("po-status")).toHaveText("Envoyée");
  await page.screenshot({ path: "test-results/screens/51-resources-po.png", fullPage: true });

  page.once("dialog", (d) => d.accept());
  await page.getByTestId("receive-po").click();
  await expect(page.getByTestId("po-status")).toHaveText("Reçue");
  await expect(page.getByTestId("flash")).toContainText("remis en stock");

  await openStock(page, "Résine biocompatible classe IIa");
  const after = Number((await page.getByTestId("stock-qty").innerText()).replace(/[^\d,]/g, "").replace(",", "."));
  expect(after).toBeCloseTo(before + 10, 3);
  await expect(page.getByTestId("stock-level")).toHaveText("OK");
});

test("sortie de stock tracée", async ({ page }) => {
  await login(page, "production", "/resources/stock");
  await openStock(page, "Filament PETG 2,85 mm");
  await page.getByTestId("move-kind").selectOption("out");
  await page.getByTestId("move-qty").fill("3");
  await page.getByTestId("move-submit").click();
  await expect(page.getByTestId("flash")).toContainText("Stock mis à jour : 35 kg");
  await expect(page.getByText("sortie manuelle")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/52-resources-stock-item.png", fullPage: true });
});

test("équipements : panne, remise en service, maintenance", async ({ page }) => {
  await login(page, "production", "/resources/equipment");
  await page.getByRole("link", { name: "SLS-02", exact: true }).click();
  await page.getByTestId("asset-down").click();
  await expect(page.getByTestId("asset-status")).toContainText("En panne");
  await page.getByTestId("asset-repair").click();
  await expect(page.getByTestId("asset-status")).not.toContainText("En panne");

  await page.goto("/resources/equipment");
  await page.getByRole("link", { name: "FDM-03", exact: true }).click();
  await page.getByTestId("maintenance-done").click();
  await expect(page.getByTestId("flash")).toContainText("prochaine dans 90 jours");
  await page.screenshot({ path: "test-results/screens/53-resources-equipment.png", fullPage: true });
});

test("commercial : lecture seule", async ({ page }) => {
  await login(page, "commercial", "/resources/stock");
  await expect(page.getByTestId("reorder-selected")).toHaveCount(0);
});
