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

test("agenda : événement avec invité, visible et notifié chez l'invité", async ({ page }) => {
  await login(page, "commercial", "/planning");
  await expect(page.getByTestId("week").getByTestId("event").filter({ hasText: "Revue de conception" }).first()).toBeVisible();
  await page.getByTestId("event-title").fill("Préparation salon aéro");
  await page.getByTestId("event-from").fill("14:00");
  await page.getByTestId("event-to").fill("15:00");
  const julien = await page.getByTestId("event-participants").locator("option", { hasText: "Julien Ferrand" }).getAttribute("value");
  await page.getByTestId("event-participants").selectOption([julien!]);
  await page.getByTestId("event-save").click();
  await expect(page.getByTestId("flash")).toContainText("1 invité(s) prévenu(s)");
  await expect(page.getByTestId("event").filter({ hasText: "Préparation salon aéro" })).toContainText("14:00–15:00");
  await page.screenshot({ path: "test-results/screens/97-agenda.png", fullPage: true });

  await login(page, "production", "/planning");
  await expect(page.getByTestId("event").filter({ hasText: "Préparation salon aéro" })).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByTestId("notifications")).toContainText("vous invite : Préparation salon aéro");
});

test("flux iCal : lisible sans session, limité au titulaire, révocable", async ({ page, request }) => {
  await login(page, "commercial", "/planning");
  await page.getByTestId("ical-generate").click();
  const url = (await page.getByTestId("ical-url").textContent())!;
  const path = new URL(url).pathname;
  const ics = await (await request.get(path)).text(); // sans cookies
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("SUMMARY:Préparation salon aéro");
  expect(ics).toContain("SUMMARY:Revue de conception avec Cargo Céleste");
  expect(ics).not.toContain("Comité de direction"); // agenda d'une autre personne
  // Nouveau lien : l'ancien ne fonctionne plus
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("ical-generate").click();
  await expect(page.getByTestId("ical-url")).not.toHaveText(url);
  expect((await request.get(path)).status()).toBe(404);
  expect((await request.get("/ical/n-importe-quoi-de-tres-long-123")).status()).toBe(404);
});
