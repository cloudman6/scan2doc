import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';

test('Smoke Verification', async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await app.waitForAppReady();

  // Verify title
  expect(await app.getTitle()).toMatch(/scan2doc/i);

  // Verify main layout elements
  await expect(page.locator('.app-container').first()).toBeVisible();
  await expect(page.locator('.app-header').first()).toBeVisible();

  // Verify core business elements
  await expect(page.getByRole('button', { name: /import files/i })).toBeVisible();

  // Verify Empty State initially
  expect(await app.isEmptyState()).toBeTruthy();
  await expect(page.getByRole('button', { name: /select files/i })).toBeVisible();

  // Verify core three-column layout is HIDDEN initially
  await expect(page.locator('.page-list-container')).not.toBeVisible();
  await expect(page.locator('.page-viewer-container')).not.toBeVisible();
  await expect(page.locator('.preview-container')).not.toBeVisible();
});
