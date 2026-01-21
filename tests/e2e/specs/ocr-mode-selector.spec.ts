import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { PageViewerPage } from '../pages/PageViewerPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

type OCRPromptType = 'document' | 'ocr' | 'free' | 'figure' | 'describe' | 'find' | 'freeform';

test.describe('OCR Mode Selector - Direct Modes', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let pageViewer: PageViewerPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        pageViewer = new PageViewerPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // Default to healthy status
        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
        await app.waitForAppReady();
    });

    // Test Case 1: All Direct Modes Selection (Healthy State)
    const directModes: OCRPromptType[] = ['document', 'ocr', 'free', 'figure', 'describe'];

    for (const mode of directModes) {
        test(`should trigger OCR for ${mode} mode when healthy`, async () => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);

            // Wait for page viewer to be ready
            await pageViewer.waitForReady();

            // Mock OCR API with success response (longer delay to catch intermediate states)
            await apiMocks.mockOCR({ delay: 1500 });

            // Trigger the OCR mode
            if (mode === 'document') {
                // Default mode, click main button
                await pageViewer.clickOCRModeMainButton();
            } else {
                // Select from dropdown
                await pageViewer.selectOCRMode(mode);
            }

            // Verify OCR is triggered and status changes to recognizing
            await expect.poll(async () => await ocrPage.getPageStatus(0), {
                timeout: 5000
            }).toBe('recognizing');

            // Wait for OCR to complete
            await ocrPage.waitForOCRSuccess(0, 10000);

            // Verify page status is success (could be ocr_success, pending_gen, completed, or generating_*)
            const status = await ocrPage.getPageStatus(0);
            expect(status).toMatch(/ocr_success|pending_gen|completed|generating_/);
        });
    }

    // Test Case 2: Queue Full Error for All Direct Modes
    for (const mode of directModes) {
        test(`should show queue full error for ${mode} mode`, async ({ page }) => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);

            // Wait for page viewer to be ready
            await pageViewer.waitForReady();

            // Mock health API to show full status
            await apiMocks.mockHealth({
                status: 'full',
                queueInfo: { depth: 10, max_size: 10, is_full: true }
            });

            // Wait for health check to update
            await page.waitForTimeout(7000);

            // Trigger the OCR mode
            if (mode === 'document') {
                await pageViewer.clickOCRModeMainButton();
            } else {
                await pageViewer.selectOCRMode(mode);
            }

            // Verify error dialog appears
            await expect(page.getByText('Queue Full', { exact: true })).toBeVisible({ timeout: 3000 });
            await expect(page.getByText('OCR queue is full')).toBeVisible();

            // Close the error dialog
            await page.getByRole('button', { name: 'OK', exact: true }).click();

            // Verify page status is still ready (task not submitted)
            const status = await ocrPage.getPageStatus(0);
            expect(status).toBe('ready');
        });
    }

    // Test Case 3: Service Unavailable Error for All Direct Modes
    for (const mode of directModes) {
        test(`should show service unavailable error for ${mode} mode`, async ({ page }) => {
            // Upload and select a page
            await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
            await pageList.clickPage(0);

            // Wait for page viewer to be ready
            await pageViewer.waitForReady();

            // Mock health API to show unavailable
            await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

            // Wait for health check to update
            await page.waitForFunction(() => {
                const hs = window.healthStore;
                return hs && hs.isAvailable === false;
            }, { timeout: 10000 });

            // Trigger the OCR mode
            if (mode === 'document') {
                await pageViewer.clickOCRModeMainButton();
            } else {
                await pageViewer.selectOCRMode(mode);
            }

            // Verify error dialog appears
            const dialog = page.locator('.n-dialog').first();
            await expect(dialog).toBeVisible();
            await expect(dialog.getByText(/(unavailable|available|offline|connect)/i).first()).toBeVisible();

            // Close the error dialog
            await page.getByRole('button', { name: /OK|确定/i }).click();

            // Verify page status is still ready (task not submitted)
            const status = await ocrPage.getPageStatus(0);
            expect(status).toBe('ready');
        });
    }

    // Test Case 4: Mode Switching and Persistence
    test('should persist selected mode and switch correctly', async ({ page, browserName }) => {
        // Skip on Chromium and Webkit due to CORS 502 errors in console
        // Skip on Firefox due to timeout issues with dropdown
        test.skip(browserName === 'firefox', 'Timeout issues with dropdown on Firefox');

        // Upload and select a page
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
        await pageList.clickPage(0);

        // Wait for page viewer to be ready
        await pageViewer.waitForReady();

        // Verify default is "Scan to Document"
        const defaultLabel = await pageViewer.getCurrentModeLabel();
        expect(defaultLabel).toContain('Scan to Document');

        // Select "General OCR" from dropdown
        await pageViewer.selectOCRMode('ocr');

        // Mock OCR API (longer delay)
        await apiMocks.mockOCR({ delay: 1500 });

        // Click main button (should trigger 'ocr' mode, not 'document')
        await pageViewer.clickOCRModeMainButton();

        // Verify OCR is triggered (could be recognizing or already finished in fast mock)
        await expect.poll(async () => await ocrPage.getPageStatus(0), {
            timeout: 5000
        }).toMatch(/recognizing|completed|ocr_success/);

        // Wait a bit for mode label to update
        await page.waitForTimeout(500);

        // Verify the label changed to "General OCR"
        const updatedLabel = await pageViewer.getCurrentModeLabel();
        expect(updatedLabel).toContain('General OCR');

        // Wait for OCR to complete
        await ocrPage.waitForOCRSuccess(0);

        // Now switch to "Parse Figure"
        await pageViewer.selectOCRMode('figure');

        // Click main button again
        await pageViewer.clickOCRModeMainButton();

        // Should trigger figure mode
        const finalLabel = await pageViewer.getCurrentModeLabel();
        expect(finalLabel).toContain('Parse Figure');
    });
});
