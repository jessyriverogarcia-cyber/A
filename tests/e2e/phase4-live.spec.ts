import { execSync } from "node:child_process";
import { expect, test, type Browser, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}
async function session(browser: Browser, who: string, next: string) {
  const page = await (await browser.newContext()).newPage();
  await login(page, who, next);
  return page;
}

test("temps réel : un collègue écrit, la cloche et la boîte se mettent à jour sans recharger", async ({ browser }) => {
  const karim = await session(browser, "commercial", "/comms?f=internal");
  await karim.waitForLoadState("networkidle");
  const before = Number((await karim.getByTestId("bell-count").textContent()) ?? 0);

  const nadia = await session(browser, "qualite", "/comms/new?kind=internal");
  const value = await nadia.getByTestId("internal-to").locator("option", { hasText: "Karim Ouali" }).getAttribute("value");
  await nadia.getByTestId("internal-to").selectOption(value!);
  await nadia.locator("input[name=subject]").fill("Temps réel — essai de notification");
  await nadia.locator("textarea[name=body]").fill("Karim, peux-tu regarder la cote du bord d'attaque ?");
  await nadia.getByTestId("new-thread-send").click();
  await expect(nadia.getByTestId("flash")).toContainText("notifié");

  // Côté Karim, sans rechargement : toast, compteur, et le fil apparaît dans « Interne »
  await expect(karim.getByTestId("notif-toast")).toContainText("vous a écrit", { timeout: 15_000 });
  await expect(karim.getByTestId("bell-count")).toHaveText(String(before + 1));
  await expect(karim.getByTestId("inbox")).toContainText("Temps réel — essai de notification", { timeout: 15_000 });
  await karim.screenshot({ path: "test-results/screens/91-temps-reel.png" });
});

test("traitements planifiés : exécution manuelle, alertes notifiées une seule fois", async ({ page }) => {
  await login(page, "direction", "/settings/tech");
  await page.getByTestId("run-jobs").click();
  await expect(page.getByTestId("flash")).toContainText(/Traitement exécuté : [1-9]\d* notification/);
  await page.getByTestId("run-jobs").click();
  await expect(page.getByTestId("flash")).toContainText("Traitement exécuté : 0 notification");
  await expect(page.getByTestId("jobs")).toContainText("manuel");
});
