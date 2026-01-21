import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import { waitForHealthyService } from '../helpers/ocr-helpers';

test.describe('OCR Health Check & Queue Recovery', () => {
    let app: AppPage;
    let pageList: PageListPage;
    let ocrPage: OCRPage;
    let apiMocks: APIMocks;

    test.beforeEach(async ({ page }) => {
        app = new AppPage(page);
        pageList = new PageListPage(page);
        ocrPage = new OCRPage(page);
        apiMocks = new APIMocks(page);

        // 默认设置为健康状态，避免干扰初始加载
        await apiMocks.mockHealth({ status: 'healthy' });
        await app.goto();
        await app.waitForAppReady();
    });

    test('should reflect health status in UI indicator', async ({ page }) => {
        // 1. Wait for initial health check to complete and verify status is healthy (success)
        await expect(page.getByTestId('ocr-health-available')).toBeVisible({ timeout: 10000 });
        expect(await app.getHealthStatusType()).toBe('success');

        // 2. Mock 服务不可用 (网络错误或 HTTP 错误，导致 isAvailable = false)
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 3. 等待轮询周期 (5s) 并验证 UI 变化
        // 我们在页面上等待指示器变为 error  类型
        await expect.poll(async () => await app.getHealthStatusType(), {
            timeout: 10000,
            intervals: [1000]
        }).toBe('error');

        // 4. 验证 Tooltip 文本
        const statusText = await app.getHealthStatusText();
        expect(statusText).toContain('Unavailable');
    });

    test('should block OCR requests when service is unavailable', async ({ page }) => {
        // 1. 设置服务不可用
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });
        // 同时 mock OCR API 为失败（防御性措施）
        await apiMocks.mockOCR({ shouldFail: true, statusCode: 503 });

        // 等待内存中的 isAvailable 状态真正变为 false
        // 这规避了 UI 虽然变色但内存状态因轮询时差还没刷新的问题
        await page.waitForFunction(() => {
            const hs = window.healthStore;
            return hs && hs.isAvailable === false;
        }, { timeout: 15000 });

        // 额外等待一小会儿确保 Vue 响应式数据流转完成
        await page.waitForTimeout(1000);

        // 2. 上传文件
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // 3. 验证页面初始状态为 ready
        expect(await ocrPage.getPageStatus(0)).toBe('ready');

        // 4. 尝试触发 OCR
        await ocrPage.triggerOCR(0);


        // 5. 验证错误对话框显示
        const dialog = page.locator('.n-dialog').first();
        await expect(dialog).toBeVisible({ timeout: 5000 });
        // 使用 first() 处理多个匹配项（标题和内容都包含关键字）
        await expect(dialog.getByText(/(unavailable|available|offline|connect)/i).first()).toBeVisible();

        // 6. 关闭对话框
        await page.getByRole('button', { name: /ok|确定/i }).click();
        await expect(dialog).not.toBeVisible();

        // 7. 验证页面状态保持为 ready (因为被 UI 拦截，未真正提交)
        const finalStatus = await ocrPage.getPageStatus(0);
        expect(finalStatus).toBe('ready');

        // 验证没有成功提示显示 (Added to Queue)
        await expect(page.locator('.n-notification')).not.toBeVisible();
    });

    test('should block OCR requests when queue is full', async ({ page }) => {
        // 1. Mock Full
        await apiMocks.mockHealth({ status: 'full' });

        // Wait for sync
        await page.waitForFunction(() => {
            const hs = window.healthStore;
            return hs && hs.isFull === true;
        }, { timeout: 15000 });

        // 2. Upload file
        await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

        // 3. Trigger OCR
        await ocrPage.triggerOCR(0);

        // 4. Verify Queue Full Dialog
        const dialog = page.locator('.n-dialog').first();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('Queue Full')).toBeVisible();

        // 5. Close
        await page.getByRole('button', { name: /ok|确定/i }).click();
        await expect(dialog).not.toBeVisible();

        // 6. Verify status ready
        const finalStatus = await ocrPage.getPageStatus(0);
        expect(finalStatus).toBe('ready');
    });

    test('should auto-recover health indicator from unavailable to healthy', async ({ page: _page }) => {
        // 1. Start Unavailable
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // Wait for red (error state)
        await expect.poll(async () => await app.getHealthStatusType(), { timeout: 10000 }).toBe('error');

        // 2. Recover to Healthy
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: false });

        // 3. Wait for green (success state)
        await expect.poll(async () => await app.getHealthStatusType(), { timeout: 10000 }).toBe('success');

        // Tooltip should be normal
        const statusText = await app.getHealthStatusText();
        expect(statusText).toContain('Healthy');
    });

    test('should auto-resume queued tasks when service recovers', async ({ page }) => {
        // 1. 初始健康
        await apiMocks.mockHealth({ status: 'healthy' });
        await apiMocks.mockOCR({ delay: 5000 }); // 让 OCR 慢一点

        // 2. 上传两个文件
        await pageList.uploadAndWaitReady([TestData.files.samplePNG(), TestData.files.sampleJPG()]);

        // 3. 触发第一个任务 (开始执行)
        await waitForHealthyService(page);
        await ocrPage.triggerOCR(0);
        // 等待状态变为 Recognizing 或 Scanning
        await expect.poll(async () => await ocrPage.getPageStatus(0)).toMatch(/recognizing|pending_ocr/);

        // 4. 触发第二个任务 (加入队列, Pending)
        // 此时服务健康，可以正常加入队列
        await ocrPage.triggerOCR(1);
        await expect.poll(async () => await ocrPage.getPageStatus(1)).toBe('pending_ocr');

        // 5. 在任务执行期间，服务变为不可用
        // 这将模拟"已在队列中的任务遇到 429 或服务不可用"的情况 (由后端重试逻辑或 processQueue 处理)
        await apiMocks.mockHealth({ status: 'healthy', shouldFail: true });

        // 6. 验证第二个页面保持 pending 状态 (或变为 waiting_retry，取决于具体实现，这里假设 pending_ocr)
        // 验证它不会失败进入 error
        await expect.poll(async () => await ocrPage.getPageStatus(1), { timeout: 5000 }).toBe('pending_ocr');

        // 7. 恢复服务健康
        await apiMocks.mockHealth({ status: 'healthy' });

        // 8. 验证任务最终成功
        await ocrPage.waitForOCRSuccess(0, 20000);
        await ocrPage.waitForOCRSuccess(1, 20000);

        expect(await ocrPage.isOCRCompleted(0)).toBeTruthy();
        expect(await ocrPage.isOCRCompleted(1)).toBeTruthy();
    });
});
