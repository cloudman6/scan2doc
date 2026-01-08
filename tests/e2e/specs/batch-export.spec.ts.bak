import { test, expect } from '../fixtures/base-test';
import path from 'path';
import fs from 'fs';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import type { PageState } from '../../src/types/page';
import { uploadFiles } from '../utils/file-upload';

interface PagesStore {
    pages: PageState[];
    selectedPageIds: Set<string>;
    loadPagesFromDB: () => Promise<void>;
}

declare global {
    interface Window {
        pagesStore?: PagesStore;
    }
}

test.describe('Batch Export', () => {
    test.beforeEach(async ({ page }) => {
        // Log all browser console messages
        page.on('console', msg => {
            console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });

        // Use a more robust way to clear data and wait for initialization
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.evaluate(async () => {
            const { db } = await import('/src/db/index.ts');
            await db.clearAllData();
            // Clear Pinia store if accessible
            if (window.pagesStore) {
                window.pagesStore.pages = [];
                window.pagesStore.selectedPageIds = new Set();
            }
        });

        await page.waitForTimeout(1000); // Breathe

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
        await page.waitForSelector('.app-header button');

        // 1. Upload 3 images
        // Note: This test focuses on export functionality, not file upload UI.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg'),
            path.resolve('tests/e2e/samples/sample.png')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        // Wait for items to appear
        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(3, { timeout: 30000 });

        // 2. Trigger OCR for the first 2 pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as Markdown"
        await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

        // 5. Verify Confirmation Dialog
        const warningDialog = page.locator('.n-dialog.n-modal');
        await expect(warningDialog).toBeVisible({ timeout: 10000 });

        // 6. Hook Download and Confirm
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await warningDialog.locator('.n-dialog__action button:has-text("Skip & Export")').click();
        const download = await downloadPromise;

        // 7. Verify File
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);
        const downloadPath = await download.path();
        const content = fs.readFileSync(downloadPath!, 'utf-8');

        // Verify Content: "瑞慈" appears twice per sample.json page
        const matches = content.match(/瑞慈/g);
        expect(matches?.length || 0).toBe(4);

        const sections = content.split('\n\n---\n\n');
        expect(sections.length).toBe(2);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export with some pages not ready (docx)', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.app-header button');

        // 1. Upload 3 images
        // Note: This test focuses on export functionality, not file upload UI.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg'),
            path.resolve('tests/e2e/samples/sample.png')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        // Wait for items to appear
        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(3, { timeout: 30000 });

        // 2. Trigger OCR for the first 2 pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as DOCX"
        await page.locator('.n-dropdown-option:has-text("Export as DOCX")').click();

        // 5. Verify Confirmation Dialog
        const warningDialog = page.locator('.n-dialog.n-modal');
        await expect(warningDialog).toBeVisible({ timeout: 10000 });

        // 6. Hook Download and Confirm
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await warningDialog.locator('.n-dialog__action button:has-text("Skip & Export")').click();
        const download = await downloadPromise;

        // 7. Verify File and Content
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.docx$/);
        const downloadPath = await download.path();

        // eslint-disable-next-line sonarjs/no-unsafe-unzip
        const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
        const docXml = await zip.file('word/document.xml')?.async('text');
        expect(docXml).toBeDefined();

        const matches = docXml!.match(/1021112511173001/g);
        expect(matches?.length || 0).toBe(2);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export with some pages not ready (pdf)', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.app-header button');

        // 1. Upload 3 images
        // Note: This test focuses on export functionality, not file upload UI.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg'),
            path.resolve('tests/e2e/samples/sample.png')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        // Wait for items to appear
        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(3, { timeout: 30000 });

        // 2. Trigger OCR for the first 2 pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as PDF"
        await page.locator('.n-dropdown-option:has-text("Export as PDF")').click();

        // 5. Verify Confirmation Dialog
        const warningDialog = page.locator('.n-dialog.n-modal');
        await expect(warningDialog).toBeVisible({ timeout: 10000 });

        // 6. Hook Download and Confirm
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await warningDialog.locator('.n-dialog__action button:has-text("Skip & Export")').click();
        const download = await downloadPromise;

        // 7. Verify File and PDF Structure
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.pdf$/);
        const downloadPath = await download.path();

        const pdfBytes = fs.readFileSync(downloadPath!);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        expect(pdfDoc.getPageCount()).toBe(2);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export when all pages are ready (markdown)', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.app-header button');

        // 1. Upload 2 images
        // Note: This test focuses on export functionality, not file upload UI.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(2, { timeout: 30000 });

        // 2. Trigger OCR for ALL pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as Markdown"
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

        // 5. Verify direct download
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$/);

        const downloadPath = await download.path();
        const content = fs.readFileSync(downloadPath!, 'utf-8');

        const matches = content.match(/瑞慈/g);
        expect(matches?.length || 0).toBe(4);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export when all pages are ready (docx)', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // 1. Upload 2 images
        // Note: This test focuses on export functionality, not file upload UI.
        // We use direct injection here because programmatic input.click() in the app
        // doesn't reliably trigger Playwright's filechooser event. The file upload
        // functionality itself is tested in file-adding.spec.ts.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(2, { timeout: 30000 });

        // 2. Trigger OCR for ALL pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as DOCX"
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await page.locator('.n-dropdown-option:has-text("Export as DOCX")').click();

        // 5. Verify direct download and content
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.docx$/);

        const downloadPath = await download.path();
        // eslint-disable-next-line sonarjs/no-unsafe-unzip
        const zip = await JSZip.loadAsync(fs.readFileSync(downloadPath!));
        const docXml = await zip.file('word/document.xml')?.async('text');

        const matches = docXml!.match(/1021112511173001/g);
        expect(matches?.length || 0).toBe(2);

        // Cleanup
        await download.delete();
    });

    test('should handle batch export when all pages are ready (pdf)', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.app-header button');

        // 1. Upload 2 images
        // Note: This test focuses on export functionality, not file upload UI.
        const filePaths = [
            path.resolve('tests/e2e/samples/sample.png'),
            path.resolve('tests/e2e/samples/sample.jpg')
        ];

        await uploadFiles(page, filePaths, '.app-header button', true); // preferDirect=true for reliability

        const pageItems = page.locator('.page-item');
        await expect(pageItems).toHaveCount(2, { timeout: 30000 });

        // 2. Trigger OCR for ALL pages
        for (let i = 0; i < 2; i++) {
            await pageItems.nth(i).click();
            await page.waitForTimeout(500);
            await page.locator('.ocr-actions .trigger-btn').click();

            await page.waitForFunction((idx) => {
                const pages = window.pagesStore?.pages || [];
                return pages[idx]?.status === 'ocr_success';
            }, i, { timeout: 30000 });
            await page.waitForTimeout(500);
        }

        // Force refresh
        await page.evaluate(() => window.pagesStore?.loadPagesFromDB());
        await page.waitForTimeout(1000);

        // 3. Selection All
        await page.locator('.selection-toolbar .n-checkbox').click();
        await page.waitForTimeout(1000);

        // 4. Trigger Export
        const exportTrigger = page.locator('.export-selected-btn');
        await expect(exportTrigger).toBeEnabled({ timeout: 10000 });
        await exportTrigger.click();

        // Select "Export as PDF"
        const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
        await page.locator('.n-dropdown-option:has-text("Export as PDF")').click();

        // 5. Verify direct download and page count
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/^document_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.pdf$/);

        const downloadPath = await download.path();
        const pdfBytes = fs.readFileSync(downloadPath!);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        expect(pdfDoc.getPageCount()).toBe(2);

        // Cleanup
        await download.delete();
    });
});
