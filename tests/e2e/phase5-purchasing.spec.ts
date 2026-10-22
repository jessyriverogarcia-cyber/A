import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("fournisseurs : taux de service, création, modification, archivage", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "production", "/resources/suppliers");
  await expect(page.getByTestId("supplier-row").filter({ hasText: "RésinaLab" })).toContainText("0 %"); // livrée en retard
  await expect(page.getByTestId("supplier-row").filter({ hasText: "Polymères du Médoc" })).toContainText("100 %");
  await page.screenshot({ path: "test-results/screens/95-fournisseurs.png", fullPage: true });

  await page.getByRole("link", { name: "Nouveau fournisseur" }).click();
  await page.getByTestId("supplier-name").fill("Argon Atlantique");
  await page.getByTestId("supplier-email").fill("commandes@argon-atlantique.test");
  await page.getByTestId("supplier-lead").fill("2");
  await page.getByTestId("supplier-save").click();
  await expect(page.getByTestId("flash")).toContainText("Fournisseur créé");
  await page.getByTestId("supplier-lead").fill("3");
  await page.getByTestId("supplier-save").click();
  await expect(page.getByTestId("flash")).toContainText("enregistrée");
  await expect(page.getByTestId("supplier-lead")).toHaveValue("3");
  await page.getByTestId("supplier-archive").click();
  await expect(page.getByTestId("flash")).toContainText("archivé");
  await page.getByRole("button", { name: "Supprimer" }).click();
  await expect(page.getByTestId("flash")).toContainText("supprimé");
});

test("réception partielle : reliquat attendu, stock à jour, puis solde", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "production", "/resources/purchase-orders");
  await page.getByRole("link", { name: /CMD-\d{4}-0031/ }).click();
  await expect(page.getByTestId("po-status")).toHaveText("Envoyée");
  await page.getByTestId("recv-POW-ALSI").fill("25");
  await page.getByTestId("receive-partial").click();
  await expect(page.getByTestId("flash")).toContainText("Réception partielle");
  await expect(page.getByTestId("po-status")).toHaveText("Reçue en partie");
  await expect(page.getByTestId("po-received").first()).toHaveText("25");
  await expect(page.getByTestId("recv-POW-ALSI")).toHaveValue("35");
  await expect(page.getByTestId("po-receipts")).toContainText("25 kg");
  await page.screenshot({ path: "test-results/screens/96-reception-partielle.png", fullPage: true });

  await page.getByTestId("receive-po").click();
  await expect(page.getByTestId("flash")).toContainText("Commande soldée");
  await expect(page.getByTestId("po-status")).toHaveText("Reçue");
  await expect(page.getByTestId("po-reception")).toHaveCount(0);

  // Stock : 18 kg au départ + 60 reçus
  await page.goto("/resources/stock");
  await expect(page.locator("tr", { hasText: "Poudre AlSi10Mg" })).toContainText("78");
});
