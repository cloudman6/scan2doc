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
      await pageList.clickBatchOCR();

      // Verify success notification
      await expect(page.locator('.n-notification').first()).toContainText(`Added ${expectedPageCount} pages to OCR queue`);

      // Wait for all pages to complete OCR
      await ocrHelpers.waitForAllOCRComplete(page);

      // Verify all pages are past ocr_success
      for (let i = 0; i < expectedPageCount; i++) {
        expect(await ocrHelpers.checkPagePastOCR(page, i)).toBeTruthy();
      }

      // 给数据库一点时间确保写入完成
      await page.waitForTimeout(1000);

      // Verify persistence after reload
      await page.reload();
      await app.waitForAppReady();
      await pageList.waitForPagesLoaded({ count: expectedPageCount });

      // Verify pages are still in a completed state
      await expect(async () => {
        const statuses = await ocrPage.getAllPageStatuses();
        for (const status of statuses) {
          // 只要不是初始状态，就说明持久化工作正常
          expect(['ready', 'pending_render', 'rendering']).not.toContain(status);
        }
      }).toPass({ timeout: 15000 });
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
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Verify notification for first batch
      await expect(page.locator('.n-notification', { hasText: /Added \d+ pages to OCR queue/ })).toBeVisible();

      // Wait for first batch to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(firstBatchCount);
      }).toPass({ timeout: 10000 });

      // Clear selection
      await pageList.unselectAll();

      // Upload second file (single image)
      await pageList.uploadAndWaitReady(TestData.files.samplePNG());
      const totalCount = await pageList.getPageCount();
      expect(totalCount).toBe(firstBatchCount + 1);

      // Select all pages (including those in OCR queue)
      await pageList.selectAll();

      // Click batch OCR
      await pageList.clickBatchOCR();

      // Verify notification shows only new page was queued (first batch was skipped)
      const skipNotification = page.locator('.n-notification', { hasText: /skipped/ });
      await expect(skipNotification).toBeVisible();
      await expect(skipNotification).toContainText(/Added 1 page to OCR queue.*skipped \d+/);

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
      await pageList.selectAll();
      await pageList.clickBatchOCR();

      // Wait for all pages to enter processing state
      await expect(async () => {
        const count = await ocrPage.getProcessingPagesCount();
        expect(count).toBe(pageCount);
      }).toPass({ timeout: 10000 });

      // All pages are now in OCR queue - try batch OCR again
      await pageList.clickBatchOCR();

      // Verify warning notification
      await expect(page.locator('.n-notification', { hasText: 'All selected pages are already processed or being processed' })).toBeVisible();

      // Allow the OCR to complete
      allowOCRToComplete.value = true;

      // Wait for all pages to complete OCR
      await ocrPage.waitForAllOCRComplete();
    });
  });
});
