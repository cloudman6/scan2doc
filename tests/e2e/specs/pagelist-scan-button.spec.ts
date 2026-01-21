import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('PageList Scan Button Interception', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
    });

    test('should show queue full dialog when clicking scan button on page item', async ({ page }) => {
        // 1. Mock Health as Full
        await apiMocks.mockHealth({ status: 'full' });

        // 2. Upload file
        await pageList.uploadAndWaitReady(TestData.files.samplePNG());

        // 3. Hover over page item to reveal buttons
        const pageItem = page.locator('[data-testid^="page-item-"]').first();
        await pageItem.hover();

        // 4. Click Scan Button
        const scanBtn = pageItem.locator('[data-testid="scan-page-btn"]');
        await expect(scanBtn).toBeVisible();

        // Wait for health store sync
        await page.waitForFunction(() => {
            const hs = window.healthStore;
            return hs && hs.isFull === true;
        });

        await scanBtn.click();

        // 5. Verify Queue Full Dialog
        const dialog = page.locator('.n-dialog').first();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Queue Full')).toBeVisible();

        // 6. Close, verify no status change
        await page.getByRole('button', { name: /ok|确定/i }).click();
        await expect(dialog).not.toBeVisible();

        // Status stays ready (monitor for short time to be sure)
        await page.waitForTimeout(1000);
        const status = await ocrPage.getPageStatus(0);
        expect(status).toBe('ready');
    });

    test('should show unavailable dialog when clicking scan button on page item', async ({ page }) => {
        // 1. Mock Health as Unavailable
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 2. Upload file
        await pageList.uploadAndWaitReady(TestData.files.samplePNG());

        // 3. Hover over page item
        const pageItem = page.locator('[data-testid^="page-item-"]').first();
        await pageItem.hover();

        // 4. Click Scan Button
        const scanBtn = pageItem.locator('[data-testid="scan-page-btn"]');
        await expect(scanBtn).toBeVisible();

        // Wait for health store sync
        await page.waitForFunction(() => {
            const hs = window.healthStore;
            return hs && hs.isAvailable === false;
        }, { timeout: 10000 });

        await scanBtn.click();

        // 5. Verify Service Unavailable Dialog
        const dialog = page.locator('.n-dialog').first();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText(/(unavailable|available|offline|connect)/i).first()).toBeVisible();

        // 6. Close
        await page.getByRole('button', { name: /ok|确定/i }).click();
        await expect(dialog).not.toBeVisible();

        // Status stays ready
        await page.waitForTimeout(1000);
        const status = await ocrPage.getPageStatus(0);
        expect(status).toBe('ready');
    });
});
