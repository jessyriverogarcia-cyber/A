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

/** Un lundi ouvré dans environ 5 semaines (hors fériés de novembre). */
function monday() {
  const d = new Date(Date.now() + 35 * 86_400_000);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}
const plus = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

test("atelier à 39 h : RTT acquis, posé dans la limite du solde", async ({ page }) => {
  await login(page, "operateur", "/me");
  await expect(page.getByText("RTT disponibles")).toBeVisible();
  await expect(page.locator("text=/acquis sur 24,1 cette année/")).toBeVisible();
  await page.getByTestId("leave-kind").selectOption("rtt");
  await page.getByTestId("leave-start").fill(monday());
  await page.getByTestId("leave-end").fill(monday());
  await page.getByTestId("leave-submit").click();
  await expect(page.getByTestId("flash")).toContainText("Demande envoyée : 1 jour");
});

test("cadre au forfait : demande au-delà du solde refusée", async ({ page }) => {
  await login(page, "commercial", "/me");
  await expect(page.locator("text=/acquis sur 9 cette année/")).toBeVisible();
  await page.getByTestId("leave-kind").selectOption("rtt");
  await page.getByTestId("leave-start").fill(monday());
  await page.getByTestId("leave-end").fill(plus(monday(), 11));
  await page.getByTestId("leave-submit").click();
  await expect(page.getByTestId("flash")).toContainText("Solde RTT insuffisant");
});

test("RH : solde RTT visible sur la fiche salarié", async ({ page }) => {
  await login(page, "rh", "/hr/employees");
  await page.getByRole("link", { name: /Karim Ouali/ }).first().click();
  await expect(page.getByTestId("employee-rtt")).toContainText("/ 9");
});
