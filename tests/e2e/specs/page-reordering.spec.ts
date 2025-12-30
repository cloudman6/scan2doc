import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';
import path from 'path';
import type { Page } from '@playwright/test';

test.describe('Page Reordering', () => {
    /**
     * Upload test files and wait for processing
     * @param page Playwright page
     * @param waitForAll Whether to wait for all pages to be ready (thumbnails loaded)
     * @returns Expected page count
     */
    async function uploadTestFiles(page: Page, waitForAll = false): Promise<number> {
        // Use sample3.pdf (multi-page) and sample.png
        const pdfPath = path.resolve('tests/e2e/fixtures/sample3.pdf');
        const pngPath = path.resolve('tests/e2e/fixtures/sample.png');

        const pdfPageCount = await getPdfPageCount(pdfPath);
        const expectedCount = pdfPageCount + 1; // PDF pages + 1 PNG

        const filePaths = [pdfPath, pngPath];

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Wait for all page items to appear
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            expect(await pageItems.count()).toBe(expectedCount);
        }).toPass({ timeout: 30000 });

        if (waitForAll) {
            // Wait for ALL thumbnails to load
            for (let i = 0; i < expectedCount; i++) {
                await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 60000 });
            }
        }

        return expectedCount;
    }

    /**
     * Get the current order of pages by reading page names
     */
    async function getPageOrder(page: Page): Promise<string[]> {
        const pageItems = page.locator('.page-item');
        const count = await pageItems.count();
        const order: string[] = [];

        for (let i = 0; i < count; i++) {
            const name = await pageItems.nth(i).locator('.page-name').textContent();
            order.push(name || '');
        }

        return order;
    }

    /**
     * Drag a page from sourceIndex to targetIndex using manual mouse events
     */
    async function dragPage(page: Page, sourceIndex: number, targetIndex: number): Promise<void> {
        const pageItems = page.locator('.page-item');
        const sourceItem = pageItems.nth(sourceIndex);
        const targetItem = pageItems.nth(targetIndex);

        // Get bounding boxes for more precise drag
        const sourceBBox = await sourceItem.boundingBox();
        const targetBBox = await targetItem.boundingBox();

        if (!sourceBBox || !targetBBox) {
            throw new Error('Could not get bounding boxes for drag operation');
        }

        // Calculate center points
        const sourceX = sourceBBox.x + sourceBBox.width / 2;
        const sourceY = sourceBBox.y + sourceBBox.height / 2;
        const targetX = targetBBox.x + targetBBox.width / 2;
        const targetY = targetBBox.y + targetBBox.height / 2;

        // Perform drag using mouse events
        await page.mouse.move(sourceX, sourceY);
        await page.mouse.down();
        await page.waitForTimeout(300); // Wait for drag handle to activate
        await page.mouse.move(targetX, targetY, { steps: 20 }); // Smoother and slower movement
        await page.waitForTimeout(300); // Wait for sorting logic to react
        await page.mouse.up();
        await page.waitForTimeout(500); // Wait for UI to stabilize
    }

    test('should reorder pages after all pages are ready and persist after reload', async ({ page, browserName }) => {
        // Skip on webkit due to blob URL limitations
        test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');

        // Extended timeout for large PDF processing
        test.setTimeout(120000);

        await page.goto('/');

        // 1. Upload files and wait for ALL pages to be ready
        const totalPages = await uploadTestFiles(page, true);

        // 2. Record initial order
        const initialOrder = await getPageOrder(page);
        expect(initialOrder.length).toBe(totalPages);

        // 3. Drag first page to third position (index 0 -> index 2)
        await dragPage(page, 0, 2);

        // 4. Wait a bit for the reorder to complete
        await page.waitForTimeout(1000);

        // 5. Verify order changed
        const newOrder = await getPageOrder(page);
        expect(newOrder).not.toEqual(initialOrder);
        expect(newOrder[0]).toBe(initialOrder[1]);
        expect(newOrder[1]).toBe(initialOrder[2]);
        expect(newOrder[2]).toBe(initialOrder[0]);

        // 6. Reload page to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // 7. Verify order persisted
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            expect(await pageItems.count()).toBe(totalPages);
        }).toPass({ timeout: 30000 });

        // Wait for all thumbnails to load after reload
        for (let i = 0; i < totalPages; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 60000 });
        }

        const persistedOrder = await getPageOrder(page);
        expect(persistedOrder).toEqual(newOrder);
    });

    test('should reorder pages when some pages are ready (drag ready page) and persist after reload', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');
        test.skip(browserName === 'firefox', 'Firefox has inconsistent drag behavior during concurrent PDF processing');
        test.setTimeout(120000);

        await page.goto('/');

        // 1. Upload files but DON'T wait for all pages to be ready
        const totalPages = await uploadTestFiles(page, false);

        // 2. Wait for at least SOME pages to be ready (but not all)
        await page.waitForFunction((total) => {
            const readyCount = document.querySelectorAll('.page-item .thumbnail-img').length;
            // At least 2 pages ready, but not all
            return readyCount >= 2 && readyCount < total;
        }, totalPages, { timeout: 60000 });

        // 3. Find a ready page to drag
        const pageItems = page.locator('.page-item');
        let readyPageIndex = -1;
        for (let i = 0; i < totalPages; i++) {
            const thumbnail = pageItems.nth(i).locator('.thumbnail-img');
            if (await thumbnail.isVisible()) {
                readyPageIndex = i;
                break;
            }
        }

        // If no ready page found, skip this test (unlikely but for consistency)
        if (readyPageIndex === -1) {
            test.skip(true, 'No ready page found for testing');
            return;
        }

        // 4. Record initial order and the page being dragged
        const initialOrder = await getPageOrder(page);
        const draggedPageName = initialOrder[readyPageIndex];

        // 5. Drag the ready page to a different position
        const targetIndex = readyPageIndex === 0 ? 2 : 0;
        await dragPage(page, readyPageIndex, targetIndex);

        // 6. Wait for database update to complete
        await page.waitForTimeout(2000);

        // 7. Verify order changed
        const newOrder = await getPageOrder(page);
        expect(newOrder).not.toEqual(initialOrder);
        // Verify the dragged page is now at the target position
        expect(newOrder[targetIndex]).toBe(draggedPageName);

        // 8. Reload to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // 9. Wait for all page items to appear
        await expect(async () => {
            expect(await pageItems.count()).toBe(totalPages);
        }).toPass({ timeout: 30000 });

        // 10. Wait for all thumbnails to eventually load (background processing may continue)
        await expect(async () => {
            const readyCount = await page.locator('.page-item .thumbnail-img').count();
            expect(readyCount).toBe(totalPages);
        }).toPass({ timeout: 60000 });

        // 11. Verify the dragged page persisted at the target position
        const persistedOrder = await getPageOrder(page);
        expect(persistedOrder[targetIndex]).toBe(draggedPageName);
    });

    test('should reorder pages when some pages are ready (drag non-ready page) and persist after reload', async ({ page, browserName }) => {
        test.skip(browserName === 'webkit', 'Playwright webkit has blob URL access control issues with large PDFs');
        test.skip(browserName === 'firefox', 'Firefox has inconsistent drag behavior during concurrent PDF processing');
        test.setTimeout(120000);

        await page.goto('/');

        // 1. Upload files but DON'T wait for all pages to be ready
        const totalPages = await uploadTestFiles(page, false);

        // 2. Wait for at least SOME pages to be ready (but not all)
        await page.waitForFunction((total) => {
            const readyCount = document.querySelectorAll('.page-item .thumbnail-img').length;
            // At least 2 pages ready, but not all
            return readyCount >= 2 && readyCount < total;
        }, totalPages, { timeout: 60000 });

        // 3. Find a NON-ready page to drag
        const pageItems = page.locator('.page-item');
        let nonReadyPageIndex = -1;
        for (let i = 0; i < totalPages; i++) {
            const thumbnail = pageItems.nth(i).locator('.thumbnail-img');
            if (!(await thumbnail.isVisible())) {
                nonReadyPageIndex = i;
                break;
            }
        }

        // If all pages are already ready, skip this test (timing issue)
        if (nonReadyPageIndex === -1) {
            test.skip(true, 'All pages completed too quickly, no non-ready page found for testing');
            return;
        }

        // 4. Record initial order and the page being dragged
        const initialOrder = await getPageOrder(page);
        const draggedPageName = initialOrder[nonReadyPageIndex];

        // 5. Drag the non-ready page to a different position
        const targetIndex = nonReadyPageIndex === 0 ? 2 : 0;
        await dragPage(page, nonReadyPageIndex, targetIndex);

        // 6. Wait for database update to complete
        await page.waitForTimeout(2000);

        // 7. Verify order changed
        const newOrder = await getPageOrder(page);
        expect(newOrder).not.toEqual(initialOrder);
        // Verify the dragged page is now at the target position
        expect(newOrder[targetIndex]).toBe(draggedPageName);

        // 8. Reload to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        // 9. Wait for all page items to appear
        await expect(async () => {
            expect(await pageItems.count()).toBe(totalPages);
        }).toPass({ timeout: 30000 });

        // 10. Wait for all thumbnails to eventually load (background processing may continue)
        await expect(async () => {
            const readyCount = await page.locator('.page-item .thumbnail-img').count();
            expect(readyCount).toBe(totalPages);
        }).toPass({ timeout: 60000 });

        // 11. Verify the dragged page persisted at the target position
        const persistedOrder = await getPageOrder(page);
        expect(persistedOrder[targetIndex]).toBe(draggedPageName);
    });
});
