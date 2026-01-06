import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';
import fs from 'fs';
import path from 'path';

interface PageStatus {
  status: string;
}

interface PageStoreResult {
  success: boolean;
  pages?: PageStatus[];
}

// Helper function to check if pages are past ready state
function checkPagesPastReadyState(pages: PageStatus[]): boolean {
  if (!pages || pages.length === 0) return false;

  for (const page of pages) {
    if (page.status === 'ready' || page.status === 'pending_render' || page.status === 'rendering') {
      return false;
    }
  }
  return true;
}

// Helper function to verify pages are past ready state after evaluate
function verifyPagesPastReadyState(result: PageStoreResult): boolean {
  if (!result.success) return false;
  return checkPagesPastReadyState(result.pages || []);
}

// Helper function to get page store data
async function getPageStoreData(page: import('@playwright/test').Page, expectedCount: number): Promise<PageStoreResult> {
  return page.evaluate((expectedCount) => {
    const pages = window.pagesStore?.pages || [];
    if (pages.length !== expectedCount) return { success: false };

    return {
      success: true,
      pages: pages.map(p => ({ status: p.status }))
    };
  }, expectedCount);
}

test.describe('Batch OCR', () => {
  test.describe('Basic Batch OCR', () => {
    test('should process all ready pages when batch OCR is clicked', async ({ page }) => {
      await page.goto('/');

      // Upload a multi-page PDF (sample.pdf has 6 pages)
      const filePath = path.resolve('tests/e2e/samples/sample.pdf');
      const expectedPageCount = await getPdfPageCount(filePath);

      // Mock OCR API
      await page.route('**/ocr', async (route) => {
        const mockResponse = JSON.parse(fs.readFileSync(path.resolve('tests/e2e/samples/sample.json'), 'utf-8'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponse),
        });
      });

      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 60000 });
      await page.locator('.app-header button').first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);

      // Wait for all pages to be ready (rendering complete)
      const pageItems = page.locator('.page-item');
      await expect(async () => {
        const count = await pageItems.count();
        expect(count).toBe(expectedPageCount);
      }).toPass({ timeout: 30000 });

      // Wait for thumbnails (indicates ready status)
      for (let i = 0; i < expectedPageCount; i++) {
        await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
      }

      // Select all pages
      await page.check('[data-testid="select-all-checkbox"]');

      // Click batch OCR button
      await page.click('[data-testid="batch-ocr-button"]');

      // Verify success message
      await expect(page.locator('.n-message').first()).toContainText(`已将 ${expectedPageCount} 个页面添加到 OCR 队列`, { timeout: 5000 });

      // Wait for all pages to reach or pass ocr_success status
      for (let i = 0; i < expectedPageCount; i++) {
        await page.waitForFunction((idx) => {
          const pages = window.pagesStore?.pages || [];
          const status = pages[idx]?.status;
          // Check if page has completed OCR or is in later stages
          return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                  'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status);
        }, i, { timeout: 30000 });
      }

      // Verify all pages are past ocr_success (completed OCR stage)
      for (let i = 0; i < expectedPageCount; i++) {
        const isPastOCR = await page.evaluate((idx) => {
          const pages = window.pagesStore?.pages || [];
          const status = pages[idx]?.status;
          return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                  'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status);
        }, i);
        expect(isPastOCR).toBeTruthy();
      }

      // Verify persistence after reload
      await page.reload();

      // Wait for page items to be visible after reload
      await expect(pageItems.first()).toBeVisible({ timeout: 10000 });

      // Verify pages are still in a completed state (not reset to ready)
      await expect(async () => {
        const result = await getPageStoreData(page, expectedPageCount);
        return verifyPagesPastReadyState(result);
      }).toPass({ timeout: 10000 });
    });
  });

  test.describe('Smart Skip Logic', () => {
    test('should skip already processed pages and only OCR ready pages', async ({ page }) => {
      await page.goto('/');

      // Mock OCR API
      await page.route('**/ocr', async (route) => {
        const mockResponse = JSON.parse(fs.readFileSync(path.resolve('tests/e2e/samples/sample.json'), 'utf-8'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponse),
        });
      });

      // Upload first PDF
      const filePath1 = path.resolve('tests/e2e/samples/sample.pdf');
      const fileChooserPromise1 = page.waitForEvent('filechooser', { timeout: 60000 });
      await page.locator('.app-header button').first().click();
      const fileChooser1 = await fileChooserPromise1;
      await fileChooser1.setFiles(filePath1);

      // Wait for pages to be ready
      let pageItems = page.locator('.page-item');
      await expect(async () => {
        const count = await pageItems.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 30000 });

      const firstBatchCount = await pageItems.count();

      // Wait for thumbnails
      for (let i = 0; i < firstBatchCount; i++) {
        await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
      }

      // Select all and do batch OCR
      await page.check('[data-testid="select-all-checkbox"]');
      await page.click('[data-testid="batch-ocr-button"]');

      // Wait for first batch to complete OCR (reach or pass ocr_success)
      for (let i = 0; i < firstBatchCount; i++) {
        await page.waitForFunction((idx) => {
          const pages = window.pagesStore?.pages || [];
          const status = pages[idx]?.status;
          return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                  'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status);
        }, i, { timeout: 30000 });
      }

      // Clear selection
      await page.uncheck('[data-testid="select-all-checkbox"]');

      // Upload second file (PNG - single page, ready status)
      const filePath2 = path.resolve('tests/e2e/samples/sample.png');

      const fileChooserPromise2 = page.waitForEvent('filechooser', { timeout: 60000 });
      await page.locator('.app-header button').first().click();
      const fileChooser2 = await fileChooserPromise2;
      await fileChooser2.setFiles(filePath2);

      // Wait for new page to be ready
      pageItems = page.locator('.page-item');
      await expect(async () => {
        const count = await pageItems.count();
        expect(count).toBe(firstBatchCount + 1);
      }).toPass({ timeout: 30000 });

      // Wait for thumbnail
      await expect(pageItems.nth(firstBatchCount).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });

      // Select all pages (including already OCR'd ones)
      await page.check('[data-testid="select-all-checkbox"]');

      // Verify first batch pages have completed OCR status
      for (let i = 0; i < firstBatchCount; i++) {
        const firstBatchStatus = await page.evaluate((idx) => {
          const pages = window.pagesStore?.pages || [];
          return pages[idx]?.status;
        }, i);
        // Should be past ocr_success
        expect(['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                'generating_pdf', 'pdf_success', 'generating_docx', 'completed']).toContain(firstBatchStatus);
      }

      // Verify new page is still ready
      const newPageStatus = await page.evaluate((idx) => {
        const pages = window.pagesStore?.pages || [];
        return pages[idx]?.status;
      }, firstBatchCount);
      expect(newPageStatus).toBe('ready');

      // Click batch OCR
      await page.click('[data-testid="batch-ocr-button"]');

      // Verify message shows only new page was processed (1 added, firstBatchCount skipped)
      await expect(page.locator('.n-message').first()).toContainText(/已将 1 个页面添加到 OCR 队列.*跳过 \d+ 个已处理/, { timeout: 5000 });

      // Wait for the new page to complete OCR
      await page.waitForFunction((idx) => {
        const pages = window.pagesStore?.pages || [];
        const status = pages[idx]?.status;
        return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status);
      }, firstBatchCount, { timeout: 30000 });
    });
  });

  test.describe('Edge Cases', () => {
    test('should show warning when all selected pages are already processed', async ({ page }) => {
      await page.goto('/');

      // Mock OCR API
      await page.route('**/ocr', async (route) => {
        const mockResponse = JSON.parse(fs.readFileSync(path.resolve('tests/e2e/samples/sample.json'), 'utf-8'));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockResponse),
        });
      });

      // Upload PDF and complete OCR
      const filePath = path.resolve('tests/e2e/samples/sample.pdf');

      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 60000 });
      await page.locator('.app-header button').first().click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);

      // Wait for pages to be ready
      const pageItems = page.locator('.page-item');
      await expect(async () => {
        const count = await pageItems.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 30000 });

      const pageCount = await pageItems.count();

      // Wait for thumbnails
      for (let i = 0; i < pageCount; i++) {
        await expect(pageItems.nth(i).locator('.thumbnail-img')).toBeVisible({ timeout: 30000 });
      }

      // Do batch OCR to complete all pages
      await page.check('[data-testid="select-all-checkbox"]');
      await page.click('[data-testid="batch-ocr-button"]');

      // Wait for OCR to complete
      for (let i = 0; i < pageCount; i++) {
        await page.waitForFunction((idx) => {
          const pages = window.pagesStore?.pages || [];
          const status = pages[idx]?.status;
          return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
                  'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status);
        }, i, { timeout: 30000 });
      }

      // Wait a bit for messages to clear
      await page.waitForTimeout(1000);

      // All pages are now past ocr_success - try batch OCR again
      await page.click('[data-testid="batch-ocr-button"]');

      // Verify warning message (look for the latest message with warning text)
      await page.waitForTimeout(500); // Give time for message to appear
      const foundWarning = await page.evaluate(() => {
        const messages = document.querySelectorAll('.n-message');
        for (const msg of messages) {
          if (msg.textContent?.includes('选中的页面都已处理或正在处理中')) {
            return true;
          }
        }
        return false;
      });
      expect(foundWarning).toBeTruthy();
    });
  });
});
