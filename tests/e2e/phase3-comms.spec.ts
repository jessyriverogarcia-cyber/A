import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeAll(() => execSync("pnpm db:seed", { stdio: "ignore" }));

async function login(page: Page, who: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByTestId(`demo-${who}`).click();
  await page.waitForURL((u) => u.pathname.startsWith(next.split("?")[0]));
}

test("commercial : boîte « à répondre », brouillon préparé, envoi en un clic", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "commercial", "/comms");
  await expect(page.getByTestId("filter-todo")).toContainText(/À répondre\s*\d+/);
  await page.screenshot({ path: "test-results/screens/70-comms-inbox.png", fullPage: true });

  await page.getByTestId("thread-row").filter({ hasText: "coques de drone" }).click();
  await expect(page.getByText("Brouillon préparé — à relire")).toBeVisible();
  await expect(page.getByTestId("reply-body")).toHaveValue(/fichiers CAO/);
  await expect(page.getByText("envoi simulé").first()).toBeVisible();
  await page.screenshot({ path: "test-results/screens/71-comms-thread.png", fullPage: true });
  await page.getByTestId("send-reply").click();
  await expect(page.getByTestId("flash")).toContainText("envoi simulé");
  await expect(page.getByTestId("messages")).toContainText("fichiers CAO");
  await expect(page.getByText("Brouillon préparé — à relire")).toHaveCount(0);

  await page.goto("/comms?f=todo");
  await expect(page.getByTestId("inbox")).not.toContainText("coques de drone");
  expect(errors).toEqual([]);
});

test("message entrant simulé : brouillon fondé sur le dossier", async ({ page }) => {
  await login(page, "commercial", "/comms?f=clients");
  await page.getByTestId("thread-row").filter({ hasText: "OF-" }).first().click();
  await page.getByTestId("simulate-inbound").click();
  await expect(page.getByTestId("flash")).toContainText("brouillon de réponse est prêt");
  await expect(page.getByTestId("reply-body")).toHaveValue(/Bonjour/);
  await expect(page.getByTestId("thread-wo")).toBeVisible();
});

test("note interne : notification, réponse, notification en retour", async ({ page }) => {
  await login(page, "commercial", "/notifications");
  await expect(page.getByTestId("bell-count")).toBeVisible();
  await page.screenshot({ path: "test-results/screens/73-notifications.png", fullPage: true });
  await page.getByTestId("notifications").getByText("vous a écrit").first().click();
  await page.waitForURL(/\/comms\/threads\//);
  await expect(page.getByText("message interne")).toBeVisible();
  await page.getByTestId("reply-body").fill("Je préviens le client ce matin et je lui propose la nouvelle date.");
  await page.getByTestId("send-reply").click();
  await expect(page.getByTestId("flash")).toContainText("Message envoyé");

  await page.context().clearCookies();
  await login(page, "qualite", "/notifications");
  await expect(page.getByTestId("notifications")).toContainText("vous a répondu");
});

test("documents : dépôt rattaché à un dossier, téléchargement privé", async ({ page }) => {
  await login(page, "production", "/comms/documents");
  await expect(page.getByTestId("document-row").first()).toBeVisible();
  await page.getByTestId("upload-file").setInputFiles({ name: "Gamme de post-traitement.txt", mimeType: "text/plain", buffer: Buffer.from("Ébavurage, sablage, contrôle visuel.") });
  const option = await page.getByTestId("upload-entity").locator("option[value^='work_order:']").first().getAttribute("value");
  await page.getByTestId("upload-entity").selectOption(option!);
  await page.getByTestId("upload-submit").click();
  await expect(page.getByTestId("flash")).toContainText("déposé");
  const row = page.getByTestId("document-row").filter({ hasText: "Gamme de post-traitement.txt" });
  await expect(row).toContainText("Dossier");
  await page.screenshot({ path: "test-results/screens/72-comms-documents.png", fullPage: true });
  const href = await row.getByRole("link").first().getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("sablage");
});

test("opérateur : lecture seule des échanges", async ({ page }) => {
  await login(page, "operateur", "/comms?f=all");
  await expect(page.getByTestId("thread-row").first()).toBeVisible();
  await expect(page.getByText("Nouveau message")).toHaveCount(0);
  await page.getByTestId("thread-row").first().click();
  await expect(page.getByTestId("send-reply")).toHaveCount(0);
});
