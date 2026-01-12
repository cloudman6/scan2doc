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
      await expect(page.getByTestId('language-selector-button')).toBeVisible();
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

        // 验证空状态标题和描述
        await expect(page.getByTestId('welcome-title')).toHaveText(texts.welcomeTitle);
        await expect(page.getByTestId('welcome-description')).toHaveText(texts.welcomeDescription);

        // 验证导入按钮
        await expect(page.getByTestId('start-import-button')).toHaveText(texts.startImport);
      });
    }

    test('should toggle between languages', async ({ page }) => {
      // 切换到中文
      await app.switchLanguage('zh-CN');
      await expect(page.getByTestId('welcome-description')).toHaveText(TestData.translations['zh-CN'].welcomeDescription);

      // 切换回英文
      await app.switchLanguage('en');
      await expect(page.getByTestId('welcome-description')).toHaveText(TestData.translations.en.welcomeDescription);
    });
  });

  test.describe('P0: Language Persistence', () => {
    // 参数化测试：验证两种语言的持久化
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should persist ${lang} after page reload`, async ({ page }) => {
        // 切换语言
        await app.switchLanguage(lang as 'en' | 'zh-CN');
        await expect(page.getByTestId('welcome-description')).toHaveText(texts.welcomeDescription);

        // 重载页面
        await page.reload();

        // 验证语言持久化
        await expect(page.getByTestId('welcome-description')).toHaveText(texts.welcomeDescription);
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

      await expect(page.getByTestId('welcome-description')).toHaveText(TestData.translations.en.welcomeDescription);
    });

    test('should priority localStorage over browser language', async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('locale', 'zh-CN'));
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });
      await page.reload();

      await expect(page.getByTestId('welcome-description')).toHaveText(TestData.translations['zh-CN'].welcomeDescription);
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
        await expect(page.getByTestId('page-count-badge')).toBeVisible();
        const counterText = await page.getByTestId('page-count-badge').textContent();
        if (lang === 'en') {
          expect(counterText).toMatch(/\d{1,3} Pages Loaded/);
        } else {
          expect(counterText).toMatch(/已加载 \d{1,3} 个页面/);
        }

        // 验证页面项按钮
        const firstPageItem = page.locator('.page-item').first();
        await firstPageItem.hover();
        await expect(page.getByRole('button', { name: texts.scanToDocument }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: texts.deletePage }).first()).toBeVisible();

        // 验证预览面板
        await expect(page.getByRole('button', { name: texts.downloadMD })).toBeVisible();
      });
    }

    test('should maintain translations when switching languages', async ({ page }) => {
      // 切换到中文
      await app.switchLanguage('zh-CN');
      await expect(page.getByTestId('page-count-badge')).toHaveText(/已加载 \d{1,3} 个页面/);

      // 切换到英文
      await app.switchLanguage('en');
      await expect(page.getByTestId('page-count-badge')).toHaveText(/\d{1,3} Pages Loaded/);

      // 切换回中文验证仍然工作
      await app.switchLanguage('zh-CN');
      await expect(page.getByTestId('page-count-badge')).toHaveText(/已加载 \d{1,3} 个页面/);
    });
  });

  test.describe('Cross-language Functionality', () => {
    // 参数化测试：验证两种语言下的功能
    for (const [lang, texts] of Object.entries(TestData.translations)) {
      test(`should work correctly in ${lang}`, async ({ page }) => {
        await app.switchLanguage(lang as 'en' | 'zh-CN');

        // 验证导入按钮存在
        await expect(page.getByTestId('import-files-button')).toBeVisible();

        // 验证空状态文本
        await expect(page.getByTestId('welcome-description')).toHaveText(texts.welcomeDescription);
        await expect(page.getByTestId('start-import-button')).toHaveText(texts.startImport);
      });
    }
  });
});
