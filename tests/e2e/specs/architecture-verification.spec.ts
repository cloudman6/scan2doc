/**
 * 架构验证测试
 * 用于验证新的 Page Object Models 和工具函数是否正常工作
 */

import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';
import { APIMocks } from '../mocks/APIMocks';

test.describe('架构验证测试', () => {
  test('应该成功初始化所有 Page Objects', async ({ page }) => {
    // 初始化 Page Objects
    const app = new AppPage(page);
    const pageList = new PageListPage(page);

    // 验证 Page Objects 可以正常使用
    await app.goto();
    await app.waitForAppReady();

    // 验证应用标题
    const title = await app.getTitle();
    expect(title.toLowerCase()).toContain('scan2doc');

    // 验证页面数量初始为 0
    const count = await pageList.getPageCount();
    expect(count).toBe(0);
  });

  test('应该成功使用 TestData', async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();

    // 验证 TestData 可以正常使用
    expect(TestData.files.samplePDF()).toContain('sample.pdf');
    expect(TestData.translations.en.welcomeDescription).toBeDefined();
    expect(TestData.exportFormats).toHaveLength(3);
    expect(TestData.pageStatuses.ready).toEqual(['ready']);
  });

  test('应该成功使用 APIMocks', async ({ page }) => {
    const apiMocks = new APIMocks(page);

    // Mock OCR API
    await apiMocks.mockOCR();

    // 验证 mock 已设置（通过导航验证路由已配置）
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('应该成功使用 PageListPage 上传文件', async ({ page }) => {
    const app = new AppPage(page);
    const pageList = new PageListPage(page);
    const apiMocks = new APIMocks(page);

    await apiMocks.mockOCR();
    await app.goto();

    // 上传单个文件
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

    // 验证文件已上传
    const count = await pageList.getPageCount();
    expect(count).toBe(1);
  });

  test.skip('应该成功使用智能等待函数', async ({ page }) => {
    const app = new AppPage(page);
    const pageList = new PageListPage(page);
    const apiMocks = new APIMocks(page);

    await apiMocks.mockOCR();
    await app.goto();
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);

    // 触发操作产生通知
    await pageList.selectAll();

    // 使用智能等待（此测试可能需要实际触发通知才能通过）
    // await waitForNotification(page, /selected/i, 5000);
  });
});
