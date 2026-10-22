import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

type Probe = {
  project(x: number, y: number, z: number): { x: number; y: number };
  objects(): { id: string; kit: string; entity: string; x: number; y: number; z: number }[];
};

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  // Le scénario écrit en base : on repart de données de démo propres.
  execSync("pnpm db:seed", { stdio: "ignore" });
});

async function openMap(page: Page, login: string, site = "campus") {
  await page.goto(`/login?next=/map/${site}`);
  await page.getByTestId(`demo-${login}`).click();
  await page.waitForSelector("[data-testid=live-map] canvas", { timeout: 60_000 });
  await expect(page.getByTestId("map-realtime")).toContainText("En direct", { timeout: 60_000 });
}

const probe = (page: Page) => page.evaluate(() => (window as unknown as { __mapProbe: Probe }).__mapProbe.objects());

async function screenPoint(page: Page, kit: string, y = 1) {
  return page.evaluate(
    ([k, h]) => {
      const p = (window as unknown as { __mapProbe: Probe }).__mapProbe;
      const o = p.objects().find((x) => x.kit === k)!;
      return { ...p.project(o.x, h as number, o.z), id: o.id, x3: o.x, z3: o.z };
    },
    [kit, y] as const,
  );
}

test("la Map vivante se charge avec ses KPI et sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openMap(page, "direction");
  await expect(page.getByTestId("hud-kpi-machines_active")).toBeVisible();
  await expect(page.getByTestId("zone-label-print_floor")).toBeVisible();
  expect((await probe(page)).length).toBeGreaterThan(30);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "test-results/screens/10-map-campus.png" });
  expect(errors).toEqual([]);
});

test("éclairage : heure réelle du site, puis jour et nuit imposés", async ({ page }) => {
  type Day = { elevation: number; nightness: number };
  const day = () => page.evaluate(() => (window as unknown as { __mapProbe: { daylight(): Day } }).__mapProbe.daylight());
  await openMap(page, "direction");
  const toggle = page.getByTestId("time-toggle");
  await expect(toggle).toHaveAttribute("data-mode", "auto");
  await expect(toggle).toContainText("Heure réelle");
  // Auto : la nuit suit la hauteur réelle du soleil à Bordeaux
  const auto = await day();
  expect(auto.nightness > 0.5).toBe(auto.elevation < -4);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-mode", "day");
  await expect.poll(async () => (await day()).nightness, { timeout: 15_000 }).toBeLessThan(0.02);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-mode", "night");
  await expect.poll(async () => (await day()).nightness, { timeout: 15_000 }).toBeGreaterThan(0.98);
  await page.screenshot({ path: "test-results/screens/10b-map-nuit.png" });
});

test("clic sur une machine : fiche résumée et lien vers le back-office", async ({ page }) => {
  await openMap(page, "direction");
  await page.waitForTimeout(4000); // fin du survol d'introduction
  const p = await screenPoint(page, "printer_metal", 1.2);
  await page.mouse.click(p.x, p.y);
  const panel = page.getByTestId("selection-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("MET-0");
  await expect(page.getByTestId("open-backoffice")).toHaveAttribute("href", /\/(ops\/(work-orders|planning)|resources\/equipment)/);
  await page.screenshot({ path: "test-results/screens/11-map-selection.png" });
});

test("une panne déclenchée met à jour la base, le KPI et le fil en temps réel", async ({ page }) => {
  await openMap(page, "direction");
  const kpi = page.getByTestId("hud-kpi-machines_active");
  const before = await kpi.innerText();
  await page.getByTestId("event-machine_down").click();
  await expect(page.getByTestId("toasts")).toContainText("en panne", { timeout: 20_000 });
  await expect(kpi).not.toHaveText(before, { timeout: 20_000 });
  await expect(page.getByTestId("activity-feed")).toContainText("Panne / maintenance");
  await page.screenshot({ path: "test-results/screens/12-map-panne.png" });
});

test("mode édition : déplacer un poste et l'enregistrer (persistant)", async ({ page }) => {
  await openMap(page, "direction");
  await page.waitForTimeout(4000);
  await page.getByTestId("edit-plan").click();
  const from = await screenPoint(page, "workstation", 0.8);
  const to = await page.evaluate(
    ([x, z]) => (window as unknown as { __mapProbe: Probe }).__mapProbe.project(x + 2, 0.8, z + 1.5),
    [from.x3, from.z3] as const,
  );
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
  await page.mouse.up();
  await expect(page.getByTestId("edit-toolbar")).toContainText("1 objet modifié");
  await page.getByTestId("save-plan").click();
  await expect(page.getByTestId("toasts")).toContainText("Plan enregistré", { timeout: 20_000 });

  await page.reload();
  await page.waitForSelector("[data-testid=live-map] canvas");
  await page.waitForTimeout(2000);
  const moved = (await probe(page)).find((o) => o.id === from.id)!;
  expect(Math.hypot(moved.x - from.x3, moved.z - from.z3)).toBeGreaterThan(0.4);
});

test("opérateur : pas de modification du plan", async ({ page }) => {
  await openMap(page, "operateur");
  await expect(page.getByTestId("scenario-bar")).toBeVisible();
  await expect(page.getByTestId("edit-plan")).toHaveCount(0);
});

test("site aéro : hangar, appareils et décollage de l'hydravion", async ({ page }) => {
  await openMap(page, "direction", "aero_hangar");
  await expect(page.getByTestId("zone-label-slipway")).toBeVisible();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "test-results/screens/13-map-aero.png" });
  await page.getByTestId("event-shipment_left").click();
  await expect(page.getByTestId("toasts")).toContainText("expédié", { timeout: 20_000 });
});
