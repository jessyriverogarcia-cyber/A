import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, login: string) {
  await page.goto("/settings/tech");
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId(`demo-${login}`).click();
  await page.waitForURL(/\/settings\/tech/);
}

test("redirige vers la connexion sans session", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await page.screenshot({ path: "test-results/screens/01-login.png" });
});

test("refuse un mauvais mot de passe", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill("direction@strato-fab.test");
  await page.getByLabel("Mot de passe").fill("faux");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
});

test("direction : voit tout, temps réel bidirectionnel", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await loginAs(page, "direction");
  await expect(page.getByTestId("tech-role")).toHaveText("Direction");
  const counts = page.getByTestId("tech-counts");
  await expect(counts.getByText("employee_salaries").locator("..")).toContainText("24");
  await expect(page.getByTestId("realtime-status")).toContainText("Connecté");
  const before = await page.getByTestId("realtime-list").locator("li").count();
  await page.getByTestId("realtime-emit").click();
  await expect(page.getByTestId("realtime-list").locator("li")).toHaveCount(before + 1);
  await expect(page.getByTestId("realtime-list").locator("li").first()).toContainText("page technique");
  await page.screenshot({ path: "test-results/screens/02-tech-direction.png", fullPage: true });

  await page.goto("/map/campus");
  await expect(page.getByTestId("kpi-machines_active")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/03-map-campus.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("opérateur : salaires et factures masqués par la RLS", async ({ page }) => {
  await loginAs(page, "operateur");
  await expect(page.getByTestId("tech-role")).toHaveText("Opérateur");
  const counts = page.getByTestId("tech-counts");
  await expect(counts.getByText("employee_salaries").locator("..")).toContainText("1"); // sa propre ligne
  await expect(counts.getByText("invoices", { exact: true }).locator("..")).toContainText("0");
  await expect(page.getByRole("link", { name: "Finance" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/screens/04-tech-operateur.png", fullPage: true });
});

test("RH : voit les salaires, pas les factures", async ({ page }) => {
  await loginAs(page, "rh");
  const counts = page.getByTestId("tech-counts");
  await expect(counts.getByText("employee_salaries").locator("..")).toContainText("24");
  await expect(counts.getByText("invoices", { exact: true }).locator("..")).toContainText("0");
});
