import type { Page } from '@playwright/test';

export class AppPage {
  constructor(private page: Page) {}

  /**
   * 访问根路径并等待网络空闲
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 清空数据库(用于测试隔离)
   */
  async clearDatabase() {
    await this.page.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      await db.clearAllData();
    });
    
    // 清空 Pinia store
    await this.page.evaluate(() => {
      if (window.pagesStore) {
        window.pagesStore.pages = [];
        window.pagesStore.selectedPageIds = new Set();
      }
    });
  }

  /**
   * 等待应用初始化完成
   */
  async waitForAppReady() {
    await this.page.waitForSelector('.app-container', { state: 'visible' });
    await this.page.waitForFunction(() => {
      return window.pagesStore !== undefined;
    }, { timeout: 10000 });
  }

  /**
   * 获取当前语言
   */
  async getCurrentLanguage(): Promise<'en' | 'zh-CN'> {
    const label = await this.page
      .locator('[data-testid="current-language-label"]')
      .textContent();
    return label === 'English' ? 'en' : 'zh-CN';
  }

  /**
   * 切换语言
   */
  async switchLanguage(language: 'en' | 'zh-CN') {
    const langName = language === 'en' ? 'English' : '中文';
    await this.page.click('[data-testid="language-selector-button"]');
    await this.page.waitForSelector('.n-dropdown-menu', { state: 'visible' });
    await this.page.locator(`.n-dropdown-option:has-text("${langName}")`).first().click();
    await this.page.waitForSelector('.n-dropdown-menu', { state: 'hidden' });
  }

  /**
   * 获取空状态提示文本
   */
  async getEmptyStateText(): Promise<string> {
    const emptyState = this.page.locator('.empty-state');
    return await emptyState.textContent() || '';
  }

  /**
   * 检查应用是否处于空状态
   */
  async isEmptyState(): Promise<boolean> {
    return await this.page.locator('.empty-state').isVisible();
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
}
