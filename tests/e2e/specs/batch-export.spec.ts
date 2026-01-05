import { test, expect } from '../fixtures/base-test';
import path from 'path';
import fs from 'fs';

test.describe('Batch Export', () => {
    test.beforeEach(async ({ page }) => {
        // Log all browser console messages
        page.on('console', msg => {
            console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        // Intercept OCR API to return mock data
        await page.route('**/ocr', async (route) => {
            console.log(`[E2E] Mocking OCR response for: ${route.request().url()}`);
            const mockResponse = JSON.parse(fs.readFileSync(path.resolve('tests/e2e/samples/sample.json'), 'utf-8'));
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponse),
            });
        });
    });

    test('should handle batch export with some pages not ready (markdown)', async ({ page }) => {
        await page.goto('/');

        // 1. Upload 3 images
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg'),
            path.resolve('tests/e2e/samples/sample.png')
        ];

        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 60000 });
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Wait for items to appear
        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(3, { timeout: 30000 });

        // 2. Trigger OCR for the first 2 pages
        // Select page 1
        await pageItems.nth(0).click();
        await page.locator('.ocr-actions .trigger-btn').click();

        // Wait for store state to be ready
        await page.waitForFunction(() => {
            const pages = (window as unknown as { pagesStore: { pages: { status: string }[] } }).pagesStore?.pages || [];
            return pages[0]?.status === 'ocr_success';
        }, { timeout: 30000 });

        // Force refresh to update UI for subsequent steps
        await page.evaluate(() => (window as unknown as { pagesStore: { loadPagesFromDB: () => void } }).pagesStore?.loadPagesFromDB());

        // Select page 2
        await pageItems.nth(1).click();
        await page.locator('.ocr-actions .trigger-btn').click();

        await page.waitForFunction(() => {
            const pages = (window as unknown as { pagesStore: { pages: { status: string }[] } }).pagesStore?.pages || [];
            return pages[1]?.status === 'ocr_success';
        }, { timeout: 30000 });

        await page.evaluate(() => (window as unknown as { pagesStore: { loadPagesFromDB: () => void } }).pagesStore?.loadPagesFromDB());

        // 3. Selection All
        // Click the select-all checkbox (Naive UI 包装器)
        await page.locator('.selection-toolbar .n-checkbox').click();

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeVisible();
        await exportTrigger.click();

        // Select "Export as Markdown" from dropdown
        await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

        // 5. Verify Confirmation Dialog
        const warningDialog = page.locator('.n-dialog.n-modal');
        await expect(warningDialog).toBeVisible({ timeout: 10000 });
        await expect(warningDialog).toContainText('Some Pages Not Ready');
        await expect(warningDialog).toContainText('1 of 3 pages');

        // 6. Hook Download and Confirm
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        // Click the positive action button in n-dialog
        await warningDialog.locator('.n-dialog__action button:has-text("Skip & Export")').click();
        const download = await downloadPromise;

        // 7. Verify File
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);
        const downloadPath = await download.path();
        const stats = fs.statSync(downloadPath!);
        expect(stats.size).toBeGreaterThan(0);

        // 8. Verify Content (Must contain 2 pages content separated by ---)
        const content = fs.readFileSync(downloadPath!, 'utf-8');
        // Based on sample.json, the output might be complex but we expect 2 separators if it's 2 pages?
        // Actually Multi-page Markdown concatenates with '\n\n---\n\n'
        // So for 2 pages, there should be 1 separator.
        const sections = content.split('\n\n---\n\n');
        expect(sections.length, 'Should have exactly 2 pages exported').toBe(2);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export when all pages are ready (markdown)', async ({ page }) => {
        await page.goto('/');

        // 1. Upload 2 images
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg')
        ];

        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 60000 });
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Wait for items
        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(2, { timeout: 30000 });

        // 2. Trigger OCR for ALL pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.locator('.ocr-actions .trigger-btn').click();

            // Wait for store state
            await page.waitForFunction((idx) => {
                const pages = (window as unknown as { pagesStore: { pages: { status: string }[] } }).pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
        }

        // Force refresh
        await page.evaluate(() => (window as unknown as { pagesStore: { loadPagesFromDB: () => void } }).pagesStore?.loadPagesFromDB());

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeVisible();
        await exportTrigger.click();

        // Select "Export as Markdown"
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

        // 5. Verify direct download (No dialog should appear)
        const warningDialog = page.locator('.n-dialog.n-modal');
        await expect(warningDialog).not.toBeVisible({ timeout: 2000 });

        const download = await downloadPromise;

        // 6. Verify File
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);
        const downloadPath = await download.path();
        const stats = fs.statSync(downloadPath!);
        expect(stats.size).toBeGreaterThan(0);

        // Cleanup
        await download.delete();
    });
});
