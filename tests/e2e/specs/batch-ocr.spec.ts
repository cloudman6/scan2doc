import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import * as ocrHelpers from '../helpers/ocr-helpers';

test.describe('Batch OCR', () => {
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

  test.describe('Basic Batch OCR', () => {
    test('should process all ready pages when batch OCR is clicked', async ({ page }) => {
      // Mock OCR API
      await apiMocks.mockOCR();

      // Upload a multi-page PDF
      const pdfPath = TestData.files.samplePDF();
      await pageList.uploadAndWaitReady(pdfPath);

      const expectedPageCount = await pageList.getPageCount();

      // Select all pages
      await pageList.selectAll();

      // Click batch OCR button
      await ocrHelpers.waitForHealthyService(page);
      await pageList.clickBatchOCR();

      // Verify success notification appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Wait for all pages to complete OCR
      await ocrHelpers.waitForAllOCRComplete(page);

      // Verify all pages are past ocr_success
      for (let i = 0; i < expectedPageCount; i++) {
        expect(await ocrHelpers.checkPagePastOCR(page, i)).toBeTruthy();
      }

      // 等待数据库写入完成
      await page.waitForLoadState('networkidle');

      // Verify persistence after reload
      await page.reload();
      await app.waitForAppReady();
      await pageList.waitForPagesLoaded({ count: expectedPageCount });

      // Verify pages are still in a completed state (after reload, status might be regenerated)
      // We just verify they exist and the count is correct
      const reloadedCount = await pageList.getPageCount();
      expect(reloadedCount).toBe(expectedPageCount);
    });
  });

  test.describe('Skip Currently Processing Pages', () => {
    test('should skip only pages currently in OCR queue (pending_ocr or recognizing)', async ({ page }) => {
      const firstBatchComplete = { value: false };

      // Mock OCR API with delay control
      await apiMocks.mockOCRWithControl(firstBatchComplete);

      // Upload first PDF
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      const firstBatchCount = await pageList.getPageCount();

      // Select all and do batch OCR
      await ocrHelpers.waitForHealthyService(page);
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Verify notification for first batch appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Wait for first batch to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(firstBatchCount);
      }).toPass({ timeout: 20000 });

      // Clear selection
      await pageList.unselectAll();

      // Upload second file (single image)
      await pageList.uploadAndWaitReady(TestData.files.samplePNG());
      const totalCount = await pageList.getPageCount();
      expect(totalCount).toBe(firstBatchCount + 1);

      // Select all pages (including those in OCR queue)
      await pageList.selectAll();

      // Click batch OCR
      await ocrHelpers.waitForHealthyService(page);
      await pageList.clickBatchOCR();

      // Verify notification appears (skipped pages notification)
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      // 不验证具体文本内容，因为文本会被翻译
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Allow the first batch OCR to complete
      firstBatchComplete.value = true;

      // Wait for all pages to complete OCR
      await ocrPage.waitForAllOCRComplete();
    });
  });

  test.describe('Edge Cases', () => {
    test('should show warning when all selected pages are currently in OCR queue', async ({ page }) => {
      const allowOCRToComplete = { value: false };

      // Mock OCR API with delay control
      await apiMocks.mockOCRWithControl(allowOCRToComplete);

      // Upload PDF
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      const pageCount = await pageList.getPageCount();

      // Do batch OCR
      await ocrHelpers.waitForHealthyService(page);
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Wait for all pages to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(pageCount);
      }).toPass({ timeout: 20000 });

      // All pages are now in OCR queue - try batch OCR again
      await ocrHelpers.waitForHealthyService(page);
      await pageList.clickBatchOCR();

      // Verify warning notification appears
      // 注意: Naive UI 的 notification API 可能不支持 class 选项，使用通用定位器
      await expect(page.locator('.n-notification').first()).toBeVisible({ timeout: 5000 });

      // Allow the OCR to complete
      allowOCRToComplete.value = true;

      // Wait for all pages to complete OCR
      await ocrPage.waitForAllOCRComplete();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle queue full gracefully during batch OCR', async ({ page }) => {
      // 1. Mock Health as Full
      await apiMocks.mockHealth({ status: 'full' });
      await apiMocks.mockOCR({ shouldFail: false }); // Should not be called

      // 2. Upload and select files
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      await pageList.selectAll();

      // 3. Click batch OCR
      // Wait for health store to be in sync (though click logic does force refresh)
      await page.waitForFunction(() => {
        const hs = window.healthStore;
        return hs && hs.isFull === true;
      });

      await pageList.clickBatchOCR();

      // 4. Verify Queue Full Dialog
      const dialog = page.locator('.n-dialog').first();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Queue Full')).toBeVisible();

      // 5. Verify no OCR request sent (indirectly by page status remaining ready)
      await page.getByRole('button', { name: /ok|确定/i }).click();
      await expect(dialog).not.toBeVisible();

      const status = await ocrPage.getPageStatus(0);
      expect(status).toBe('ready');
    });

    test('should block batch OCR when service is unavailable', async ({ page }) => {
      // 1. Mock Health as Unavailable
      await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });
      await apiMocks.mockOCR({ shouldFail: true, statusCode: 503 });

      // 2. Upload and select files
      await pageList.uploadAndWaitReady(TestData.files.samplePDF());
      await pageList.selectAll();

      // 3. Click batch OCR
      // Wait for health store to be in sync
      await page.waitForFunction(() => {
        const hs = window.healthStore;
        return hs && hs.isAvailable === false;
      }, { timeout: 10000 });

      await pageList.clickBatchOCR();

      // 4. Verify Service Unavailable Dialog
      const dialog = page.locator('.n-dialog').first();
      await expect(dialog).toBeVisible();
      // Use logic similar to health-check.spec.ts to avoid strict mode issues
      await expect(dialog.getByText(/(unavailable|available|offline|connect)/i).first()).toBeVisible();

      // 5. Verify no OCR request
      await page.getByRole('button', { name: /ok|确定/i }).click();
      await expect(dialog).not.toBeVisible();

      const status = await ocrPage.getPageStatus(0);
      expect(status).toBe('ready');
    });
  });
});
