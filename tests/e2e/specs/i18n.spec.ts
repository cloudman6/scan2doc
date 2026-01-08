/**
 * Internationalization (i18n) Tests - Refactored Version
 * 使用配置驱动和参数化测试减少代码重复
 */

import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { TestData } from '../data/TestData';
import { uploadFiles } from '../utils/file-upload';

test.describe('Internationalization (i18n) - Refactored', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await page.goto('/');
  });

  test.describe('P0: Language Selector Visibility', () => {
    test('should display language selector button in header', async ({ page }) => {
      await expect(page.locator('[data-testid="language-selector-button"]')).toBeVisible();
    });

    test('should display current language label', async ({ page }) => {
      const label = page.locator('[data-testid="current-language-label"]');
      await expect(label).toBeVisible();
      const text = await label.textContent();
      expect(text).toMatch(/^(English|中文)$/);
    });

    test('should show both language options in dropdown', async ({ page }) => {
      await page.click('[data-testid="language-selector-button"]');
      await expect(page.getByText('English')).toBeVisible();
      await expect(page.getByText('中文')).toBeVisible();
    });
  });

  test.describe('P0: Language Switching', () => {
    // 参数化测试：验证两种语言的切换
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should display correct ${lang} translations`, async ({ page }) => {
        await app.switchLanguage(lang as 'en' | 'zh-CN');

        // 验证空状态文本
        await expect(page.getByText(texts.emptyState)).toBeVisible();

        // 验证导入按钮
        await expect(page.getByRole('button', { name: new RegExp(texts.importButton, 'i') })).toBeVisible();

        // 验证选择文件按钮
        await expect(page.getByRole('button', { name: texts.selectFiles })).toBeVisible();
      });
    }

    test('should toggle between languages', async ({ page }) => {
      // 切换到中文
      await app.switchLanguage('zh-CN');
      await expect(page.getByText(TestData.translations['zh-CN'].emptyState)).toBeVisible();

      // 切换回英文
      await app.switchLanguage('en');
      await expect(page.getByText(TestData.translations.en.emptyState)).toBeVisible();
    });
  });

  test.describe('P0: Language Persistence', () => {
    // 参数化测试：验证两种语言的持久化
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should persist ${lang} after page reload`, async ({ page }) => {
        const langLabel = lang === 'en' ? 'English' : '中文';

        // 切换语言
        await app.switchLanguage(lang as 'en' | 'zh-CN');
        await expect(page.locator('[data-testid="current-language-label"]')).toContainText(langLabel);

        // 重载页面
        await page.reload();

        // 验证语言持久化
        await expect(page.locator('[data-testid="current-language-label"]')).toContainText(langLabel);
        await expect(page.getByText(texts.emptyState)).toBeVisible();
      });
    }
  });

  test.describe('P1: Initial Language Detection', () => {
    test('should use default language (English) when no localStorage', async ({ page }) => {
      await page.evaluate(() => localStorage.clear());
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });
      await page.reload();

      await expect(page.locator('[data-testid="current-language-label"]')).toContainText('English');
    });

    test('should prioritize localStorage over browser language', async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('locale', 'zh-CN'));
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });
      await page.reload();

      await expect(page.locator('[data-testid="current-language-label"]')).toContainText('中文');
    });
  });

  test.describe('P1: UI Text Translation After File Upload', () => {
    test.beforeEach(async ({ page }) => {
      await uploadFiles(page, ['tests/e2e/samples/sample.pdf']);
      await page.waitForSelector('.page-item', { timeout: 15000 });
    });

    // 参数化测试：验证文件上传后的UI翻译
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should translate UI elements to ${lang}`, async ({ page }) => {
        await app.switchLanguage(lang as 'en' | 'zh-CN');

        // 验证页面计数器
        const counterPattern = lang === 'en' ? /\d{1,3} Pages Loaded/ : /已加载 \d{1,3} 个页面/;
        await expect(page.getByText(counterPattern)).toBeVisible();

        // 验证页面项按钮
        const firstPageItem = page.locator('.page-item').first();
        await firstPageItem.hover();
        await expect(page.getByRole('button', { name: texts.scanToDocument }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: texts.deletePage }).first()).toBeVisible();

        // 验证页面查看器
        await expect(page.getByText(texts.selectAPage)).toBeVisible();
        await expect(page.getByText(texts.status)).toBeVisible();
        await expect(page.getByText(texts.ready)).toBeVisible();
        await expect(page.getByRole('button', { name: texts.fit })).toBeVisible();

        // 验证预览面板
        await expect(page.getByRole('button', { name: texts.downloadMD })).toBeVisible();
      });
    }

    test('should maintain translations when switching languages', async ({ page }) => {
      // 切换到中文
      await app.switchLanguage('zh-CN');
      await expect(page.getByText(/已加载 \d{1,3} 个页面/)).toBeVisible();

      // 切换到英文
      await app.switchLanguage('en');
      await expect(page.getByText(/\d{1,3} Pages Loaded/)).toBeVisible();

      // 切换回中文验证仍然工作
      await app.switchLanguage('zh-CN');
      await expect(page.getByText(/已加载 \d{1,3} 个页面/)).toBeVisible();
    });
  });

  test.describe('Cross-language Functionality', () => {
    // 参数化测试：验证两种语言下的功能
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should work correctly in ${lang}`, async ({ page }) => {
        await app.switchLanguage(lang as 'en' | 'zh-CN');

        // 验证导入按钮存在
        await expect(page.getByRole('button', { name: new RegExp(texts.importButton, 'i') })).toBeVisible();

        // 验证空状态文本
        await expect(page.getByText(texts.emptyState)).toBeVisible();
        await expect(page.getByRole('button', { name: texts.selectFiles })).toBeVisible();
      });
    }
  });
});
