import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';
import path from 'path';
import type { Page, Locator } from '@playwright/test';

test.describe('Page Deleting', () => {
    // Test file paths
    const TEST_FILES = [
        'sample.pdf',
        'sample2.pdf',
        'sample.png',
        'sample2.png',
        'sample.jpg',
        'sample2.jpg',
        'sample.jpeg',
        'sample2.jpeg'
    ];

    /**
     * Calculate expected total page count for all test files
     */
    async function calculateExpectedPageCount(filePaths: string[]): Promise<number> {
        let total = 0;
        for (const filePath of filePaths) {
            if (filePath.endsWith('.pdf')) {
                total += await getPdfPageCount(filePath);
            } else {
                // Image files count as 1 page each
                total += 1;
            }
        }
        return total;
    }

    /**
     * Upload test files and wait for all pages to be processed
     */
    async function uploadTestFiles(page: Page): Promise<number> {
        const filePaths = TEST_FILES.map(f => path.resolve(`tests/e2e/fixtures/${f}`));

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.locator('.app-header button').first().click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(filePaths);

        // Calculate expected page count
        const expectedCount = await calculateExpectedPageCount(filePaths);

        // Wait for all page items to appear
        const pageItems = page.locator('.page-item');
        await expect(async () => {
            expect(await pageItems.count()).toBe(expectedCount);
        }).toPass({ timeout: 30000 });

        // Wait for all thumbnails to load
        for (let i = 0; i < expectedCount; i++) {
            await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
        }

        return expectedCount;
    }

    /**
     * Get random page indices (avoiding duplicates)
     */
    function getRandomPageIndices(totalCount: number, selectCount: number): number[] {
        const indices = Array.from({ length: totalCount }, (_, i) => i);
        const selected: number[] = [];
        for (let i = 0; i < selectCount; i++) {
            // eslint-disable-next-line sonarjs/pseudo-random
            const randomIndex = Math.floor(Math.random() * indices.length);
            selected.push(indices[randomIndex]);
            indices.splice(randomIndex, 1);
        }
        return selected.sort((a, b) => a - b);
    }

    /**
     * Verify page selection state (CSS class + checkbox)
     */
    async function verifyPageSelected(pageItem: Locator, shouldBeSelected: boolean) {
        if (shouldBeSelected) {
            await expect(pageItem).toHaveClass(/selected/);
            // For NCheckbox, check the aria-checked attribute
            const checkbox = pageItem.locator('.page-checkbox');
            await expect(checkbox).toHaveAttribute('aria-checked', 'true');
        } else {
            await expect(pageItem).not.toHaveClass(/selected/);
            const checkbox = pageItem.locator('.page-checkbox');
            await expect(checkbox).toHaveAttribute('aria-checked', 'false');
        }
    }

    test('should delete a single page and persist after reload', async ({ page }) => {
        await page.goto('/');

        // Upload test files
        await uploadTestFiles(page);

        // Test deletion on multiple pages (loop 2 times to verify randomness)
        for (let testIndex = 0; testIndex < 2; testIndex++) {
            const currentPageCount = await page.locator('.page-item').count();

            // Select a random page (avoid first and last to prevent edge case bias)
            // eslint-disable-next-line sonarjs/pseudo-random
            const targetIndex = Math.floor(Math.random() * (currentPageCount - 2)) + 1;
            const targetPageItem = page.locator('.page-item').nth(targetIndex);

            // Hover to make delete button visible
            await targetPageItem.hover();

            // Click delete button
            await targetPageItem.locator('button[title="Delete page"]').click();

            // Verify confirmation dialog appears
            const dialog = page.locator('.n-dialog');
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText('Confirm Deletion');

            // Click Confirm in dialog
            await dialog.locator('button').filter({ hasText: 'Confirm' }).click();

            // Verify page count decreased
            await expect(async () => {
                expect(await page.locator('.page-item').count()).toBe(currentPageCount - 1);
            }).toPass({ timeout: 5000 });

            // Verify success message appears
            // Naive UI message usually has .n-message class
            const message = page.locator('.n-message');
            await expect(message).toBeVisible();
            await expect(message).toContainText('deleted');

            // Wait for message to auto-dismiss
            await expect(message).not.toBeVisible({ timeout: 10000 });

            // Reload page to verify persistence
            await page.reload();
            await page.waitForLoadState('networkidle');

            // Verify deletion persisted
            const pageItemsAfterReload = page.locator('.page-item');
            const remainingCount = currentPageCount - 1;

            await expect(async () => {
                expect(await pageItemsAfterReload.count()).toBe(remainingCount);
            }).toPass({ timeout: 10000 });

            // Wait for all thumbnails to load after reload
            for (let i = 0; i < remainingCount; i++) {
                await expect(pageItemsAfterReload.nth(i).locator('.thumbnail-img'))
                    .toBeVisible({ timeout: 30000 });
            }
        }
    });


    test('should delete multiple pages and persist after reload', async ({ page }) => {
        await page.goto('/');

        const totalPages = await uploadTestFiles(page);
        const selectCount = Math.floor(totalPages / 3); // Select about 1/3 of pages

        // Randomly select pages
        const selectedIndices = getRandomPageIndices(totalPages, selectCount);

        // Select pages by clicking checkboxes
        for (const index of selectedIndices) {
            const pageItem = page.locator('.page-item').nth(index);
            await pageItem.locator('.page-checkbox').click();

            // Verify selection state (both CSS class and checkbox)
            await verifyPageSelected(pageItem, true);
        }

        // Verify delete button is visible
        const deleteBtn = page.locator('.delete-selected-btn');
        await expect(deleteBtn).toBeVisible();

        // Click batch delete
        await deleteBtn.click();

        // Verify confirmation dialog
        const dialog = page.locator('.n-dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(selectCount.toString());

        // Confirm deletion
        await dialog.locator('button').filter({ hasText: 'Confirm' }).click();

        // Verify page count decreased
        await expect(async () => {
            expect(await page.locator('.page-item').count()).toBe(totalPages - selectCount);
        }).toPass({ timeout: 5000 });

        // Verify success message
        const message = page.locator('.n-message');
        await expect(message).toBeVisible();
        await expect(message).toContainText('pages deleted');
        await expect(message).toContainText(selectCount.toString());

        // Wait for message to dismiss
        await expect(message).not.toBeVisible({ timeout: 10000 });

        // Reload to verify persistence
        await page.reload();
        await page.waitForLoadState('networkidle');

        const remainingCount = totalPages - selectCount;
        await expect(async () => {
            expect(await page.locator('.page-item').count()).toBe(remainingCount);
        }).toPass({ timeout: 10000 });

        // Wait for all thumbnails
        for (let i = 0; i < remainingCount; i++) {
            await expect(page.locator('.page-item').nth(i).locator('.thumbnail-img'))
                .toBeVisible({ timeout: 30000 });
        }
    });


    test('should delete all pages and show empty state', async ({ page }) => {
        await page.goto('/');

        const totalPages = await uploadTestFiles(page);

        // Click select all checkbox
        const selectAllCheckbox = page.locator('.selection-toolbar .n-checkbox');
        await selectAllCheckbox.click();

        // Verify all selected (checkbox state)
        await expect(selectAllCheckbox).toHaveAttribute('aria-checked', 'true');

        // Verify each page is selected
        const pageItems = page.locator('.page-item');
        for (let i = 0; i < totalPages; i++) {
            await verifyPageSelected(pageItems.nth(i), true);
        }

        // Click delete
        await page.locator('.delete-selected-btn').click();

        // Confirm
        const dialog = page.locator('.n-dialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('button').filter({ hasText: 'Confirm' }).click();

        // Verify all pages deleted
        await expect(async () => {
            expect(await page.locator('.page-item').count()).toBe(0);
        }).toPass({ timeout: 5000 });

        // Verify empty state
        const emptyState = page.locator('.empty-state-hero');
        await expect(emptyState).toBeVisible();
        await expect(page.getByText('Drop PDF or Images here to start')).toBeVisible();

        // Verify success message
        const message = page.locator('.n-message');
        await expect(message).toBeVisible();

        // Wait for message to dismiss
        await expect(message).not.toBeVisible({ timeout: 10000 });

        // Reload to verify empty state persists
        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(page.locator('.page-item')).toHaveCount(0);
        await expect(emptyState).toBeVisible();
    });

});
