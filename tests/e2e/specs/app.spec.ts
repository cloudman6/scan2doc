import { test, expect } from '@playwright/test';

test('Smoke Verification', async ({ page }) => {
    await page.goto('/');

    // Verify title
    await expect(page).toHaveTitle(/scan2doc/i);

    // Verify main layout elements
    await expect(page.locator('.app-container').first()).toBeVisible();
    await expect(page.locator('.app-header').first()).toBeVisible();

    // Verify core business elements (Strict semantic matching)
    await expect(page.getByRole('button', { name: /add file/i })).toBeVisible();
    await expect(page.getByText(/no file added/i)).toBeVisible();

    // Verify core three-column layout (Robust positioning)
    await expect(page.locator('.page-list-container').first()).toBeVisible();
    await expect(page.locator('.page-viewer-container').first()).toBeVisible();
    await expect(page.locator('.preview-container').first()).toBeVisible();
});
