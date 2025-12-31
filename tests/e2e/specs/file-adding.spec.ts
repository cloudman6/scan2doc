import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';

import path from 'path';

test.describe('File Adding', () => {
    test('should process uploaded PDF and generate thumbnail', async ({ page }) => {
        await page.goto('/');

        // Prepare path
        const filePath = path.resolve('tests/e2e/samples/sample.pdf');
        const expectedPageCount = await getPdfPageCount(filePath);

        // Setup file chooser
        const fileChooserPromise = page.waitForEvent('filechooser');

        // Click Add File
        await page.locator('.app-header button').first().click();

        // Handle chooser
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // Assert: Wait for correct number of items
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedPageCount);
        }).toPass({ timeout: 30000 });

        const pageItem = pageItems.first();
        await expect(pageItem).toBeVisible({ timeout: 30000 });
    });

    test('should process multiple files uploaded simultaneously', async ({ page }) => {
        await page.goto('/');

        const pdfPath = path.resolve('tests/e2e/samples/sample.pdf');
        const pngPath = path.resolve('tests/e2e/samples/sample.png');
        const jpgPath = path.resolve('tests/e2e/samples/sample.jpg');

        const pdfPageCount = await getPdfPageCount(pdfPath);
        const expectedTotalCount = pdfPageCount + 1 + 1; // 1 for PNG, 1 for JPG

        const filePaths = [pdfPath, pngPath, jpgPath];

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Wait for ALL items to be visible
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedTotalCount);
        }).toPass({ timeout: 30000 });

        // Wait for ALL items to have thumbnails (meaning processing is done for all)
        for (let i = 0; i < expectedTotalCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }

        // Final verification of items exist
        await expect(pageItems.nth(0)).toBeVisible();
        await expect(pageItems.nth(1)).toBeVisible();
        await expect(pageItems.nth(2)).toBeVisible();
    });

    test('should handle repeated upload of the same file', async ({ page }) => {
        await page.goto('/');

        const filePath = path.resolve('tests/e2e/samples/sample.pdf');
        const singleFilePageCount = await getPdfPageCount(filePath);

        // First upload
        const fileChooserPromise1 = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser1 = await fileChooserPromise1;
        await fileChooser1.setFiles(filePath);

        // Record initial count
        await expect(async () => {
            const count = await page.locator('.page-item').count();
            expect(count).toBe(singleFilePageCount);
        }).toPass({ timeout: 30000 });

        // Second upload (same file)
        const fileChooserPromise2 = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser2 = await fileChooserPromise2;
        await fileChooser2.setFiles(filePath);

        // Should now have exactly double the items
        const expectedTotalCount = singleFilePageCount * 2;
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const currentCount = await pageItems.count();
            expect(currentCount).toBe(expectedTotalCount);
        }).toPass({ timeout: 30000 });

        // Ensure ALL items (including newly added ones) are processed
        for (let i = 0; i < expectedTotalCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }
    });
    test('should sync selection when adding two images sequentially', async ({ page }) => {
        await page.goto('/');

        const pngPath = path.resolve('tests/e2e/samples/sample.png');
        const jpgPath = path.resolve('tests/e2e/samples/sample.jpg');

        // 1. Add first image (PNG)
        const fileChooserPromise1 = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser1 = await fileChooserPromise1;
        await fileChooser1.setFiles(pngPath);

        // Verify PNG is selected in PageList
        const pageItems = page.locator('.page-item');
        await expect(pageItems.first()).toHaveClass(/active|selected/);

        // Verify Page Viewer shows PNG (Size: 141.8 KB)
        await expect(page.locator('.page-viewer .page-image')).toBeVisible();
        // Check title contains "Page" followed by something (ID is alphanumeric)
        await expect(page.locator('.page-viewer .page-title')).toContainText(/Page .+/);
        await expect(page.locator('.page-viewer')).toContainText('141.8 KB');

        // 2. Add second image (JPG)
        const fileChooserPromise2 = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser2 = await fileChooserPromise2;
        await fileChooser2.setFiles(jpgPath);

        // Wait for both items
        await expect(pageItems).toHaveCount(2);

        // Verify second image (JPG) is now selected (auto-switch)
        await expect(pageItems.nth(1)).toHaveClass(/active|selected/);
        // Verify first image is NOT selected
        await expect(pageItems.nth(0)).not.toHaveClass(/active|selected/);

        // Verify Page Viewer displays the NEW image (Size: 9.1 KB)
        // We can verify this by checking if the image element is visible and perhaps the title or store state implies change.
        // For E2E without strict image matching, checking visibility and lack of "No image available" is good.
        await expect(page.locator('.page-viewer .page-image')).toBeVisible();
        await expect(page.locator('.page-viewer')).not.toContainText('No image available');
        await expect(page.locator('.page-viewer')).toContainText('9.1 KB');

        // 3. Click back to first image
        await pageItems.nth(0).click();

        // Verify selection returns to first image
        await expect(pageItems.nth(0)).toHaveClass(/active|selected/);
        await expect(pageItems.nth(1)).not.toHaveClass(/active|selected/);

        // Verify Page Viewer updates again to PNG size
        await expect(page.locator('.page-viewer .page-image')).toBeVisible();
        await expect(page.locator('.page-viewer')).toContainText('141.8 KB');
    });
});
