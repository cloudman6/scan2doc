import type { Page } from '@playwright/test';

export class OCRPage {
  constructor(private page: Page) {}

  /**
   * 等待 OCR 成功
   */
  async waitForOCRSuccess(pageIndex: number, timeout: number = 30000) {
    await this.page.waitForFunction(
      (idx) => {
        const pages = window.pagesStore?.pages || [];
        const status = pages[idx]?.status;
        return ['ocr_success', 'pending_gen', 'generating_markdown', 
                'markdown_success', 'generating_pdf', 'pdf_success', 
                'generating_docx', 'completed'].includes(status || '');
      },
      pageIndex,
      { timeout }
    );
  }

  /**
   * 等待所有页面 OCR 完成
   */
  async waitForAllOCRComplete(timeout: number = 60000) {
    await this.page.waitForFunction(
      () => {
        const pages = window.pagesStore?.pages || [];
        return pages.every(p =>
          ['ocr_success', 'pending_gen', 'generating_markdown', 
           'markdown_success', 'generating_pdf', 'pdf_success', 
           'generating_docx', 'completed'].includes(p.status)
        );
      },
      { timeout }
    );
  }

  /**
   * 获取页面 OCR 状态
   */
  async getPageStatus(pageIndex: number): Promise<string> {
    return await this.page.evaluate((idx) => {
      const pages = window.pagesStore?.pages || [];
      return pages[idx]?.status || '';
    }, pageIndex);
  }

  /**
   * 检查是否有页面在 OCR 队列中
   */
  async hasProcessingPages(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const pages = window.pagesStore?.pages || [];
      return pages.some(p => 
        p.status === 'pending_ocr' || p.status === 'recognizing'
      );
    });
  }

  /**
   * 获取正在处理的页面数量
   */
  async getProcessingPagesCount(): Promise<number> {
    return await this.page.evaluate(() => {
      const pages = window.pagesStore?.pages || [];
      return pages.filter(p => 
        p.status === 'pending_ocr' || p.status === 'recognizing'
      ).length;
    });
  }

  /**
   * 触发单个页面的 OCR
   */
  async triggerOCR(pageIndex: number) {
    // 先点击页面选中
    await this.page.locator('.page-item').nth(pageIndex).click();
    // 点击 OCR 按钮
    await this.page.locator('.ocr-actions .trigger-btn').click();
  }

  /**
   * 检查页面是否已完成 OCR
   */
  async isOCRCompleted(pageIndex: number): Promise<boolean> {
    const status = await this.getPageStatus(pageIndex);
    return ['ocr_success', 'pending_gen', 'generating_markdown', 
            'markdown_success', 'generating_pdf', 'pdf_success', 
            'generating_docx', 'completed'].includes(status);
  }

  /**
   * 获取所有页面的 OCR 状态
   */
  async getAllPageStatuses(): Promise<string[]> {
    return await this.page.evaluate(() => {
      const pages = window.pagesStore?.pages || [];
      return pages.map(p => p.status);
    });
  }
}
