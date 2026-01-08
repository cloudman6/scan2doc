import type { Page } from '@playwright/test';

export class PageListPage {
  constructor(private page: Page) {}

  /**
   * 获取页面列表容器
   */
  private get container() {
    return this.page.locator('.page-list-container');
  }

  /**
   * 获取所有页面项
   */
  private get pageItems() {
    return this.page.locator('.page-item');
  }

  /**
   * 全选所有页面
   */
  async selectAll() {
    await this.page.getByTestId('select-all-checkbox').check();
    // 等待选择状态更新
    await this.page.waitForTimeout(100);
  }

  /**
   * 取消全选
   */
  async unselectAll() {
    await this.page.getByTestId('select-all-checkbox').uncheck();
    await this.page.waitForTimeout(100);
  }

  /**
   * 点击批量 OCR 按钮
   */
  async clickBatchOCR() {
    await this.page.getByTestId('batch-ocr-button').click();
  }

  /**
   * 删除选中的页面(完整流程)
   */
  async deleteSelected() {
    const initialCount = await this.getPageCount();
    
    // 点击删除按钮
    await this.page.click('.delete-selected-btn');
    
    // 确认弹窗
    const dialog = this.page.locator('.n-dialog.n-modal');
    await dialog.waitFor({ state: 'visible' });
    await dialog.locator('button:has-text("Confirm")').click();
    
    // 等待成功提示
    await this.page.locator('.n-notification:has-text("deleted")').waitFor({ 
      state: 'visible',
      timeout: 5000 
    });
    
    // 等待列表更新
    await this.page.waitForFunction(
      (expected) => {
        const items = document.querySelectorAll('.page-item');
        return items.length < expected;
      },
      initialCount,
      { timeout: 5000 }
    );
  }

  /**
   * 精准拖拽 - 使用 mouse API
   */
  async dragAndDrop(fromIndex: number, toIndex: number) {
    const sourceItem = this.pageItems.nth(fromIndex);
    const targetItem = this.pageItems.nth(toIndex);

    // 确保元素可见
    await sourceItem.scrollIntoViewIfNeeded();
    await targetItem.scrollIntoViewIfNeeded();

    // 获取拖拽手柄
    const sourceHandle = sourceItem.locator('.drag-handle');
    const targetHandle = targetItem.locator('.drag-handle');

    // 使用 mouse API 进行精准拖拽
    const sourceBBox = await sourceHandle.boundingBox();
    const targetBBox = await targetHandle.boundingBox();

    if (!sourceBBox || !targetBBox) {
      throw new Error('Cannot get element bounding box');
    }

    // 模拟真实拖拽行为
    await this.page.mouse.move(
      sourceBBox.x + sourceBBox.width / 2,
      sourceBBox.y + sourceBBox.height / 2
    );
    await this.page.mouse.down();
    await this.page.waitForTimeout(200); // 悬停以触发拖拽状态
    await this.page.mouse.move(
      targetBBox.x + targetBBox.width / 2,
      targetBBox.y + targetBBox.height / 2,
      { steps: 10 } // 平滑移动
    );
    await this.page.mouse.up();

    // 等待数据库更新
    await this.waitForDatabaseUpdate();
  }

  /**
   * 等待数据库更新完成
   */
  private async waitForDatabaseUpdate() {
    await this.page.waitForTimeout(1000); // TODO: 替换为更精确的等待
  }

  /**
   * 验证 IndexedDB 中的顺序
   */
  async verifyOrderInDatabase(expectedOrder: string[]): Promise<boolean> {
    return await this.page.evaluate(async (expected) => {
      const { db } = await import('/src/db/index.ts');
      const pages = await db.pages.orderBy('order').toArray();
      const actualNames = pages.map(p => p.name);
      return JSON.stringify(actualNames) === JSON.stringify(expected);
    }, expectedOrder);
  }

  /**
   * 获取页面数量
   */
  async getPageCount(): Promise<number> {
    return await this.pageItems.count();
  }

  /**
   * 获取当前页面顺序
   */
  async getPageOrder(): Promise<string[]> {
    const count = await this.getPageCount();
    const order: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = await this.pageItems.nth(i).locator('.page-name').textContent();
      order.push(name || '');
    }

    return order;
  }

  /**
   * 等待页面加载完成
   */
  async waitForPagesLoaded(options: { count?: number; timeout?: number } = {}) {
    const { count, timeout = 30000 } = options;

    if (count !== undefined) {
      await this.page.waitForFunction(
        (expectedCount) => {
          const items = document.querySelectorAll('.page-item');
          return items.length === expectedCount;
        },
        count,
        { timeout }
      );
    } else {
      await this.pageItems.first().waitFor({ state: 'visible', timeout });
    }
  }

  /**
   * 等待所有缩略图就绪
   */
  async waitForThumbnailsReady(timeout: number = 30000) {
    const count = await this.getPageCount();
    
    for (let i = 0; i < count; i++) {
      await this.pageItems
        .nth(i)
        .locator('.thumbnail-img')
        .waitFor({ state: 'visible', timeout });
    }
  }

  /**
   * 检查所有缩略图是否可见
   */
  async areAllThumbnailsVisible(): Promise<boolean> {
    const count = await this.getPageCount();
    const thumbnails = this.page.locator('.page-item .thumbnail-img');
    const visibleCount = await thumbnails.count();
    return visibleCount === count;
  }

  /**
   * 点击指定页面
   */
  async clickPage(index: number) {
    await this.pageItems.nth(index).click();
    await this.page.waitForTimeout(100); // 等待选择状态更新
  }

  /**
   * 上传文件并等待处理完成
   */
  async uploadAndWaitReady(filePaths: string | string[]) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      this.page.click('.app-header button:has-text("Import Files")')
    ]);
    
    await fileChooser.setFiles(paths);
    await this.waitForPagesLoaded();
    await this.waitForThumbnailsReady();
  }

  /**
   * 获取选中的页面数量
   */
  async getSelectedCount(): Promise<number> {
    return await this.page.evaluate(() => {
      return window.pagesStore?.selectedPageIds?.size || 0;
    });
  }

  /**
   * 检查页面是否被选中
   */
  async isPageSelected(index: number): Promise<boolean> {
    const item = this.pageItems.nth(index);
    const classes = await item.getAttribute('class');
    return classes?.includes('selected') || false;
  }
}
