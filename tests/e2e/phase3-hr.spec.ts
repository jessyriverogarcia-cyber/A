import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

/** Lundi et vendredi d'une semaine dans ~5 semaines (évite les jours fériés de novembre). */
function futureWeek() {
  const d = new Date(Date.now() + 35 * 86_400_000);
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const friday = new Date(monday.getTime() + 4 * 86_400_000);
  return [monday, friday].map((x) => x.toISOString().slice(0, 10));
}

test("opérateur : badgeuse virtuelle et demande de congé", async ({ page }) => {
  await login(page, "operateur", "/me");
  await page.getByTestId("badge-break_start").click();
  await expect(page.getByTestId("flash")).toContainText("Début de pause");
  await page.getByTestId("badge-break_end").click();
  await expect(page.getByTestId("flash")).toContainText("Fin de pause");

  const [mon, fri] = futureWeek();
  await page.getByTestId("leave-start").fill(mon);
  await page.getByTestId("leave-end").fill(fri);
  await page.getByTestId("leave-submit").click();
  await expect(page.getByTestId("flash")).toContainText(/Demande envoyée : [45] jour\(s\) ouvré\(s\)/);
  await expect(page.getByTestId("my-leaves")).toContainText("En attente");
  await page.screenshot({ path: "test-results/screens/60-hr-me.png", fullPage: true });

  await page.goto("/hr");
  await expect(page.getByText("Module RH non accessible")).toBeVisible();
});

test("RH : valider le congé en un clic, corriger un oubli de pointage", async ({ page }) => {
  await login(page, "rh", "/hr");
  const tiles = page.getByTestId("hr-tiles");
  await expect(tiles).toContainText("Samir Haddad");
  await expect(tiles).toContainText("Hugo Barthe");
  await page.screenshot({ path: "test-results/screens/61-hr-todo.png", fullPage: true });
  await page.getByTestId("leave-Samir-ok").first().click();
  await expect(page.getByTestId("flash")).toContainText("Congé validé pour Samir Haddad");

  await page.goto("/hr/presence");
  await page.screenshot({ path: "test-results/screens/62-hr-presence.png", fullPage: true });
  await page.getByTestId("fix-Hugo").getByRole("button", { name: "OK" }).click();
  await expect(page.getByTestId("flash")).toContainText("Pointage corrigé");
  await expect(page.getByTestId("fix-Hugo")).toHaveCount(0);
});

test("salaires : visibles RH, masqués pour la production ; export de paie", async ({ page }) => {
  await login(page, "rh", "/hr/employees");
  await page.getByRole("link", { name: /Claire Morvan/ }).click();
  await expect(page.getByTestId("salary")).toContainText("Brut annuel");
  const csv = await page.request.get("/hr/payroll/export?kind=payroll");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Base brute mensuelle");
  await page.goto("/hr/payroll");
  await page.screenshot({ path: "test-results/screens/63-hr-payroll.png", fullPage: true });

  await page.context().clearCookies();
  await login(page, "production", "/hr/employees");
  await page.getByRole("link", { name: /Claire Morvan/ }).click();
  await expect(page.getByTestId("salary-hidden")).toBeVisible();
  expect((await page.request.get("/hr/payroll/export?kind=payroll")).status()).toBe(403);
});

test("recrutement : faire avancer un candidat", async ({ page }) => {
  await login(page, "rh", "/hr/recruitment");
  await page.getByTestId("cand-stage-Morgane Perrin").selectOption("interview");
  await page.getByTestId("cand-move-Morgane Perrin").click();
  await expect(page.getByTestId("cand-col-interview")).toContainText("Morgane Perrin");
});
