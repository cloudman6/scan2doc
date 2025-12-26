import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';
import path from 'path';

test.describe('Persistence', () => {
    test('should persist data after reload', async ({ page }) => {
        // Reasonable timeout for reload stability and multi-page processing
        test.setTimeout(30000);

        await page.goto('/');

        // 1. Upload sample.pdf (6 pages) to verify PDF.js FontLoader fix
        const filePath = path.resolve('tests/e2e/fixtures/sample.pdf');
        const expectedPageCount = await getPdfPageCount(filePath);

        const fileChooserPromise = page.waitForEvent('filechooser');

        // Use the specific button locator
        await page.locator('.app-header button').first().click();

        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // 2. Wait for items to appear and be ready
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedPageCount);
        }).toPass({ timeout: 30000 });

        // Ensure processed before reload
        for (let i = 0; i < expectedPageCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }

        // 3. Reload Page
        await page.reload();

        // 4. Verify exact data and state is restored
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedPageCount);
        }).toPass({ timeout: 30000 });

        for (let i = 0; i < expectedPageCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }
    });

    test('should continue background processing after page reload with large PDF', async ({ page, browserName }) => {
        // Skip on Playwright webkit due to blob URL limitations (real Safari works fine)
        test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');

        // Extended timeout for large PDF processing and reload scenarios
        test.setTimeout(120000);

        await page.goto('/');

        // 1. Upload sample3.pdf (20-30 pages)
        const filePath = path.resolve('tests/e2e/fixtures/sample3.pdf');
        const expectedPageCount = await getPdfPageCount(filePath);

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePath);

        // 2. Wait for page items to appear
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedPageCount);
        }).toPass({ timeout: 30000 });

        // 3. Wait until SOME pages are ready (but NOT all)
        // This ensures we catch the app mid-processing
        await page.waitForFunction((totalPages) => {
            const readyCount = document.querySelectorAll('.page-item .thumbnail-img').length;
            // At least 1 page ready, but not all pages
            return readyCount > 0 && readyCount < totalPages;
        }, expectedPageCount, { timeout: 60000 });

        // 4. Immediately reload the page
        await page.reload();

        // 5. Verify page count is restored
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBe(expectedPageCount);
        }).toPass({ timeout: 30000 });

        // 6. Verify background processing continues and ALL pages eventually become ready
        await expect(async () => {
            const readyCount = await page.locator('.page-item .thumbnail-img').count();
            expect(readyCount).toBe(expectedPageCount);
        }).toPass({ timeout: 60000 });

        // Final verification: all thumbnails are visible
        for (let i = 0; i < expectedPageCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 10000 });
        }
    });
});
