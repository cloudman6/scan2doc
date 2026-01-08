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
    const expectedLabel = language === 'en' ? 'English' : '中文';
    const currentLabel = await this.page.locator('[data-testid="current-language-label"]').textContent();

    // 如果当前语言已经是目标语言，不需要切换
    if (currentLabel === expectedLabel) {
      return;
    }

    const langName = language === 'en' ? 'English' : '中文';
    await this.page.click('[data-testid="language-selector-button"]');
    await this.page.waitForSelector('.n-dropdown-menu', { state: 'visible' });
    await this.page.locator(`.n-dropdown-option:has-text("${langName}")`).first().click();
    
    // 等待下拉菜单关闭，使用 catch 忽略超时（有些情况下菜单可能已经关闭）
    await this.page.waitForSelector('.n-dropdown-menu', { state: 'hidden' }).catch(() => {});
    
    // 验证语言确实已经切换
    await this.page.waitForFunction(
      (expected: string) => {
        const label = document.querySelector('[data-testid="current-language-label"]');
        return label?.textContent === expected;
      },
      expectedLabel,
      { timeout: 5000 }
    );
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
    return await this.page.locator('.empty-state-container, .empty-state').first().isVisible();
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
}
