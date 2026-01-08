import type { Page } from '@playwright/test';

export class PageViewerPage {
  constructor(private page: Page) {}

  /**
   * 获取页面查看器容器
   */
  private get container() {
    return this.page.locator('.page-viewer-container');
  }

  /**
   * 获取当前显示的图片
   */
  private get currentImage() {
    return this.container.locator('.page-image');
  }

  /**
   * 等待图片加载完成
   */
  async waitForImageLoaded() {
    await this.currentImage.waitFor({ state: 'visible' });
  }

  /**
   * 检查是否显示"选择页面"提示
   */
  async isSelectPagePromptVisible(): Promise<boolean> {
    return await this.page.locator('.select-page-prompt').isVisible();
  }

  /**
   * 获取当前页面状态文本
   */
  async getStatusText(): Promise<string> {
    return await this.page.locator('.status-text').textContent() || '';
  }

  /**
   * 检查查看器是否可见
   */
  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  /**
   * 获取当前显示的图片 URL
   */
  async getCurrentImageUrl(): Promise<string | null> {
    return await this.currentImage.getAttribute('src');
  }

  /**
   * 等待查看器就绪
   */
  async waitForReady(timeout: number = 10000) {
    await this.container.waitFor({ state: 'visible', timeout });
  }

  /**
   * 点击适应按钮
   */
  async clickFitButton() {
    await this.page.locator('.fit-button').click();
  }

  /**
   * 点击缩放按钮
   */
  async clickZoomIn() {
    await this.page.locator('.zoom-in-button').click();
  }

  async clickZoomOut() {
    await this.page.locator('.zoom-out-button').click();
  }

  /**
   * 获取当前缩放级别
   */
  async getZoomLevel(): Promise<number> {
    return await this.page.evaluate(() => {
      const img = document.querySelector('.page-image') as HTMLImageElement;
      if (!img) return 1;
      const transform = window.getComputedStyle(img).transform;
      if (transform === 'none') return 1;
      const matrix = transform.match(/matrix\(([^)]+)\)/);
      if (!matrix) return 1;
      const values = matrix[1].split(',');
      return parseFloat(values[0]);
    });
  }
}
