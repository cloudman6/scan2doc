/**
 * OCR 相关的 Helper 函数
 */

import type { Page } from '@playwright/test';

/**
 * 检查页面是否已完成 OCR
 */
export async function checkPagePastOCR(page: Page, idx: number): Promise<boolean> {
  return await page.evaluate((index) => {
    const pages = window.pagesStore?.pages || [];
    const status = pages[index]?.status;
    return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
            'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status || '');
  }, idx);
}

/**
 * 检查有多少页面正在处理中
 */
export async function checkProcessingPagesCount(page: Page, expectedCount: number): Promise<boolean> {
  return await page.evaluate((count) => {
    const pages = window.pagesStore?.pages || [];
    const processingCount = pages.filter(p => 
      p.status === 'pending_ocr' || p.status === 'recognizing'
    ).length;
    return processingCount === count;
  }, expectedCount);
}

/**
 * 检查所有页面是否都完成了 OCR
 */
export async function checkAllPagesCompletedOCR(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  });
}

/**
 * 等待所有 OCR 完成
 */
export async function waitForAllOCRComplete(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForFunction(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  }, { timeout });
}
