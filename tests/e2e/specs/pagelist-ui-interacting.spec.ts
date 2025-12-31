import { test, expect } from '../fixtures/base-test';
import path from 'path';
import type { Page } from '@playwright/test';

test.describe('Page-List UI Interactions', () => {
    // Test file paths
    const TEST_FILES = [
        'sample.pdf',
        'sample.png',
        'sample.jpg',
        'sample2.jpeg'
    ];

    /**
     * Upload test files and wait for all page items to appear
     */
    async function uploadTestFiles(page: Page): Promise<number> {
        const filePaths = TEST_FILES.map(f => path.resolve(`tests/e2e/samples/${f}`));

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Wait for all page items to appear (PDF + images)
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            const count = await pageItems.count();
            expect(count).toBeGreaterThan(0);
        }).toPass({ timeout: 30000 });

        const totalCount = await pageItems.count();

        // Wait for all thumbnails to load
        for (let i = 0; i < totalCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }

        return totalCount;
    }

    test('should show/hide delete button on page-item hover', async ({ page }) => {
        await page.goto('/');

        // Upload test files
        const totalPages = await uploadTestFiles(page);
        expect(totalPages).toBeGreaterThan(0);

        // Select a random page item (middle one for safety)
        const targetIndex = Math.floor(totalPages / 2);
        const targetPageItem = page.locator('.page-item').nth(targetIndex);
        const deleteButton = targetPageItem.locator('button[title="Delete page"]');

        const actionsContainer = targetPageItem.locator('.actions-container');

        // 1. Verify actions container is hidden by default (opacity: 0)
        await expect(actionsContainer).toHaveCSS('opacity', '0');

        // 2. Hover over page-item and verify actions container becomes visible
        await targetPageItem.hover();
        await expect(actionsContainer).toHaveCSS('opacity', '1');

        // 3. Hover over delete button and verify icon changes to red
        await deleteButton.hover();
        const deleteIcon = deleteButton.locator('.n-icon');
        await expect(async () => {
            const color = await deleteIcon.evaluate(el =>
                window.getComputedStyle(el).color
            );
            // rgb(208, 48, 80) is #d03050
            expect(color).toBe('rgb(208, 48, 80)');
        }).toPass({ timeout: 2000 });

        // 4. Move mouse away from delete button (but still on page-item) and verify icon reverts
        await targetPageItem.hover({ position: { x: 10, y: 10 } }); // Hover on left side
        await expect(async () => {
            const color = await deleteIcon.evaluate(el =>
                window.getComputedStyle(el).color
            );
            // rgb(102, 102, 102) is #666
            expect(color).toBe('rgb(102, 102, 102)');
        }).toPass({ timeout: 2000 });

        // 5. Move mouse away and verify actions container hides
        await page.mouse.move(0, 0);
        await expect(actionsContainer).toHaveCSS('opacity', '0');
    });

    test('should show/hide toolbar delete button on select-all interaction', async ({ page }) => {
        await page.goto('/');

        const totalPages = await uploadTestFiles(page);
        expect(totalPages).toBeGreaterThan(0);

        const toolbarCheckbox = page.locator('.selection-toolbar .n-checkbox');
        const toolbarDeleteBtn = page.locator('.delete-selected-btn');
        const pageItems = page.locator('.page-item');

        // 1. Verify toolbar delete button is NOT visible by default
        await expect(toolbarDeleteBtn).not.toBeVisible();

        // 2. Click toolbar checkbox to select all
        await toolbarCheckbox.click();

        // 3. Verify all page-item checkboxes are checked
        for (let i = 0; i < totalPages; i++) {
            const pageCheckbox = pageItems.nth(i).locator('.page-checkbox');
            await expect(pageCheckbox).toHaveAttribute('aria-checked', 'true');
        }

        // 4. Verify toolbar delete button is now visible
        await expect(toolbarDeleteBtn).toBeVisible();

        // 5. Hover over toolbar delete button and verify icon changes to red
        await toolbarDeleteBtn.hover();
        const deleteIcon = toolbarDeleteBtn.locator('.n-icon');
        await expect(async () => {
            const color = await deleteIcon.evaluate(el =>
                window.getComputedStyle(el).color
            );
            expect(color).toBe('rgb(208, 48, 80)');
        }).toPass({ timeout: 2000 });

        // 6. Move mouse away and verify icon reverts
        await page.mouse.move(0, 0);
        await expect(async () => {
            const color = await deleteIcon.evaluate(el =>
                window.getComputedStyle(el).color
            );
            expect(color).toBe('rgb(102, 102, 102)');
        }).toPass({ timeout: 2000 });

        // 7. Uncheck toolbar checkbox to deselect all
        await toolbarCheckbox.click();

        // 8. Verify all page-item checkboxes are unchecked
        for (let i = 0; i < totalPages; i++) {
            const pageCheckbox = pageItems.nth(i).locator('.page-checkbox');
            await expect(pageCheckbox).toHaveAttribute('aria-checked', 'false');
        }

        // 9. Verify toolbar delete button is hidden
        await expect(toolbarDeleteBtn).not.toBeVisible();
    });

    test('should show/hide toolbar delete button on single page selection', async ({ page }) => {
        await page.goto('/');

        const totalPages = await uploadTestFiles(page);
        expect(totalPages).toBeGreaterThan(0);

        const toolbarDeleteBtn = page.locator('.delete-selected-btn');
        const pageItems = page.locator('.page-item');

        // 1. Verify toolbar delete button is NOT visible by default
        await expect(toolbarDeleteBtn).not.toBeVisible();

        // 2. Select a random page-item checkbox
        const targetIndex = Math.floor(totalPages / 2);
        const targetCheckbox = pageItems.nth(targetIndex).locator('.page-checkbox');
        await targetCheckbox.click();

        // 3. Verify toolbar delete button is now visible
        await expect(toolbarDeleteBtn).toBeVisible();

        // 4. Verify the checkbox is checked
        await expect(targetCheckbox).toHaveAttribute('aria-checked', 'true');

        // 5. Uncheck the checkbox
        await targetCheckbox.click();

        // 6. Verify toolbar delete button is hidden
        await expect(toolbarDeleteBtn).not.toBeVisible();

        // 7. Verify the checkbox is unchecked
        await expect(targetCheckbox).toHaveAttribute('aria-checked', 'false');
    });

    test('should allow dragging page-items to reorder', async ({ page }) => {
        await page.goto('/');

        const totalPages = await uploadTestFiles(page);
        expect(totalPages).toBeGreaterThan(1);

        /**
         * Get the current order of pages by reading page names
         */
        async function getPageOrder(): Promise<string[]> {
            const pageItems = page.locator('.page-item');
            const count = await pageItems.count();
            const order: string[] = [];

            for (let i = 0; i < count; i++) {
                const name = await pageItems.nth(i).locator('.page-name').textContent();
                order.push(name || '');
            }

            return order;
        }

        // Record initial order
        const initialOrder = await getPageOrder();
        expect(initialOrder.length).toBeGreaterThan(1);


        // Drag first page to second position
        const pageItems = page.locator('.page-item');
        const sourceItem = pageItems.nth(0);
        const targetItem = pageItems.nth(1);

        const sourceBBox = await sourceItem.boundingBox();
        const targetBBox = await targetItem.boundingBox();

        if (!sourceBBox || !targetBBox) {
            throw new Error('Could not get bounding boxes for drag operation');
        }

        const sourceX = sourceBBox.x + sourceBBox.width / 2;
        const sourceY = sourceBBox.y + sourceBBox.height / 2;
        const targetX = targetBBox.x + targetBBox.width / 2;
        const targetY = targetBBox.y + targetBBox.height / 2;

        // Perform drag
        await page.mouse.move(sourceX, sourceY);
        await page.mouse.down();
        await page.waitForTimeout(100);
        await page.mouse.move(targetX, targetY, { steps: 10 });
        await page.waitForTimeout(100);
        await page.mouse.up();

        // Wait for reorder to complete
        await page.waitForTimeout(1000);

        // Verify order changed
        const newOrder = await getPageOrder();
        expect(newOrder).not.toEqual(initialOrder);
        // First item should now be in second position
        expect(newOrder[1]).toBe(initialOrder[0]);
    });
});
