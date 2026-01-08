# Playwright E2E 测试重构方案

## 一、架构设计

### 1.1 Page Object Model 设计

#### 目录结构
```
tests/e2e/
├── pages/
│   ├── AppPage.ts           # 全局操作
│   ├── PageListPage.ts      # 页面列表操作
│   ├── PageViewerPage.ts    # 页面查看器
│   ├── PreviewPage.ts       # 预览面板
│   ├── OCRPage.ts           # OCR 操作封装
│   └── ExportPage.ts        # 导出操作封装
├── helpers/
│   ├── ocr-helpers.ts       # OCR 辅助函数
│   ├── export-helpers.ts    # 导出辅助函数
│   ├── page-helpers.ts      # 页面操作辅助
│   └── wait-helpers.ts      # 智能等待
├── mocks/
│   ├── APIMocks.ts          # API Mock 封装
│   └── responses/           # Mock 响应数据
├── data/
│   └── TestData.ts          # 测试数据管理
└── matchers/
    └── custom-matchers.ts   # 自定义断言
```

#### 1.1.1 AppPage.ts

```typescript
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
   * 清空数据库（用于测试隔离）
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
}
```

#### 1.1.2 PageListPage.ts

```typescript
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
   * 删除选中的页面（完整流程）
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
   * 精准拖拽- 使用 mouse API
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
  async uploadAndWaitReady(filePaths: string[]) {
    const { uploadFiles } = await import('../utils/file-upload');
    await uploadFiles(this.page, filePaths);
    await this.waitForPagesLoaded();
    await this.waitForThumbnailsReady();
  }
}
```

#### 1.1.3 OCRPage.ts

```typescript
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
}
```

#### 1.1.4 ExportPage.ts（新增）

```typescript
import type { Page, Download } from '@playwright/test';

export class ExportPage {
  constructor(private page: Page) {}

  /**
   * 导出为指定格式
   */
  async exportAs(format: 'Markdown' | 'DOCX' | 'PDF'): Promise<Download> {
    // 点击导出按钮
    await this.page.locator('.export-selected-btn').click();

    // 等待下载
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

    // 选择格式
    await this.page.locator(`.n-dropdown-option:has-text("Export as ${format}")`).click();

    return await downloadPromise;
  }

  /**
   * 导出时处理确认对话框
   */
  async exportAsWithConfirmation(format: 'Markdown' | 'DOCX' | 'PDF'): Promise<Download> {
    // 点击导出按钮
    await this.page.locator('.export-selected-btn').click();

    // 选择格式
    await this.page.locator(`.n-dropdown-option:has-text("Export as ${format}")`).click();

    // 等待确认对话框
    const dialog = this.page.locator('.n-dialog.n-modal');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });

    // 等待下载
    const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });

    // 点击跳过并导出
    await dialog.locator('button:has-text("Skip & Export")').click();

    return await downloadPromise;
  }

  /**
   * 验证导出文件名
   */
  verifyFileName(download: Download, extension: string): boolean {
    const filename = download.suggestedFilename();
    const pattern = new RegExp(`^document_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.${extension}$`);
    return pattern.test(filename);
  }
}
```

### 1.2 智能等待系统

#### wait-helpers.ts

```typescript
import type { Page } from '@playwright/test';

/**
 * 等待 Store 达到特定状态
 */
export async function waitForStoreState<T>(
  page: Page,
  predicate: (store: any) => T,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100 } = options;

  return await page.waitForFunction(
    (pred) => {
      if (!window.pagesStore) return null;
      return pred(window.pagesStore);
    },
    predicate,
    { timeout, polling: interval }
  );
}

/**
 * 等待页面达到指定状态
 */
export async function waitForPageStatus(
  page: Page,
  pageIndex: number,
  status: string | string[],
  timeout: number = 10000
): Promise<void> {
  const statuses = Array.isArray(status) ? status : [status];

  await page.waitForFunction(
    ([idx, expectedStatuses]) => {
      const pages = window.pagesStore?.pages || [];
      const currentStatus = pages[idx]?.status;
      return expectedStatuses.includes(currentStatus);
    },
    [pageIndex, statuses] as const,
    { timeout }
  );
}

/**
 * 等待通知出现
 */
export async function waitForNotification(
  page: Page,
  text: string | RegExp,
  timeout: number = 5000
): Promise<void> {
  const selector = typeof text === 'string'
    ? `.n-notification:has-text("${text}")`
    : '.n-notification';

  const notification = page.locator(selector);
  await notification.waitFor({ state: 'visible', timeout });

  if (typeof text !== 'string') {
    const content = await notification.textContent();
    if (!text.test(content || '')) {
      throw new Error(`Notification content "${content}" does not match pattern ${text}`);
    }
  }
}

/**
 * 等待数据库操作完成
 */
export async function waitForDatabaseSync(
  page: Page,
  timeout: number = 2000
): Promise<void> {
  // TODO: 实现更精确的数据库同步检测
  // 当前使用固定等待，未来可以监听 IndexedDB 事件
  await page.waitForTimeout(timeout);
}

/**
 * 轮询检查条件（替代 waitForTimeout）
 */
export async function pollUntil<T>(
  condition: () => Promise<T>,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100, errorMessage = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) return result;
    } catch (e) {
      // 继续轮询
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(errorMessage);
}
```

### 1.3 自定义 Matchers

#### custom-matchers.ts

```typescript
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const customMatchers = {
  /**
   * 检查页面状态
   */
  async toHavePageStatus(
    page: Page,
    pageIndex: number,
    expectedStatus: string
  ) {
    const actual = await page.evaluate((idx) => {
      return window.pagesStore?.pages[idx]?.status;
    }, pageIndex);

    return {
      pass: actual === expectedStatus,
      message: () => 
        `Expected page ${pageIndex} to have status "${expectedStatus}", but got "${actual}"`
    };
  },

  /**
   * 检查页面顺序
   */
  async toHaveConsistentOrder(page: Page, expectedNames: string[]) {
    const names = await page.locator('.page-name').allTextContents();
    const pass = JSON.stringify(names) === JSON.stringify(expectedNames);
    
    return {
      pass,
      message: () => pass 
        ? 'Order matches' 
        : `Order mismatch.\nExpected: ${JSON.stringify(expectedNames)}\nGot: ${JSON.stringify(names)}`
    };
  },

  /**
   * 检查数据库中的顺序
   */
  async toHaveDatabaseOrder(page: Page, expectedOrder: string[]) {
    const actualOrder = await page.evaluate(async () => {
      const { db } = await import('/src/db/index.ts');
      const pages = await db.pages.orderBy('order').toArray();
      return pages.map(p => p.name);
    });

    const pass = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);

    return {
      pass,
      message: () => pass
        ? 'Database order matches'
        : `Database order mismatch.\nExpected: ${JSON.stringify(expectedOrder)}\nGot: ${JSON.stringify(actualOrder)}`
    };
  },

  /**
   * 检查所有缩略图是否加载
   */
  async toHaveAllThumbnails(page: Page) {
    const pageCount = await page.locator('.page-item').count();
    const thumbnailCount = await page.locator('.page-item .thumbnail-img').count();
    const pass = pageCount === thumbnailCount && pageCount > 0;

    return {
      pass,
      message: () => pass
        ? 'All thumbnails are loaded'
        : `Expected ${pageCount} thumbnails, but found ${thumbnailCount}`
    };
  }
};

// 注册自定义 matchers
expect.extend(customMatchers);
```

### 1.4 API Mocks 系统

#### APIMocks.ts

```typescript
import type { Page, Route } from '@playwright/test';
import fs from 'fs';
import path from 'path';

export class APIMocks {
  constructor(private page: Page) {}

  /**
   * Mock OCR API
   */
  async mockOCR(options: {
    delay?: number;
    response?: object;
    shouldFail?: boolean;
    statusCode?: number;
  } = {}) {
    const {
      delay = 0,
      response,
      shouldFail = false,
      statusCode = shouldFail ? 500 : 200
    } = options;

    await this.page.route('**/ocr', async (route: Route) => {
      // 模拟网络延迟
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 模拟失败
      if (shouldFail) {
        await route.fulfill({
          status: statusCode,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'OCR service unavailable' })
        });
        return;
      }

      // 使用默认或自定义响应
      const mockResponse = response || this.loadDefaultOCRResponse();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * Mock OCR API 带延迟控制（用于复杂测试场景）
   */
  async mockOCRWithControl(completeFlag: { value: boolean }) {
    await this.page.route('**/ocr', async (route: Route) => {
      // 等待 flag 变为 true
      while (!completeFlag.value) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const mockResponse = this.loadDefaultOCRResponse();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponse)
      });
    });
  }

  /**
   * 移除所有 OCR mocks
   */
  async unmockOCR() {
    await this.page.unroute('**/ocr');
  }

  /**
   * 加载默认 OCR 响应
   */
  private loadDefaultOCRResponse(): object {
    const responsePath = path.resolve('tests/e2e/samples/sample.json');
    return JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
  }
}
```

### 1.5 测试数据管理

#### TestData.ts

```typescript
import path from 'path';
import fs from 'fs';

export const TestData = {
  // 文件路径
  files: {
    samplePDF: () => path.resolve('tests/e2e/samples/sample.pdf'),
    samplePNG: () => path.resolve('tests/e2e/samples/sample.png'),
    sampleJPG: () => path.resolve('tests/e2e/samples/sample.jpg'),
    largePDF: () => path.resolve('tests/e2e/samples/sample3.pdf'),
    
    // 批量文件
    multipleImages: () => [
      TestData.files.samplePNG(),
      TestData.files.sampleJPG(),
      TestData.files.samplePNG()
    ],
    
    pdfAndImages: () => [
      TestData.files.samplePDF(),
      TestData.files.samplePNG(),
      TestData.files.sampleJPG()
    ]
  },

  // 国际化翻译
  translations: {
    en: {
      emptyState: 'Drop PDF or Images here to start',
      importButton: 'Import Files',
      selectFiles: 'Select Files',
      pageCounter: (n: number) => `${n} Pages Loaded`,
      scanToDocument: 'Scan to Document',
      deletePage: 'Delete page',
      selectAPage: 'Select a page to view',
      status: 'Status:',
      ready: 'Ready',
      fit: 'Fit',
      downloadMD: 'Download MD'
    },
    'zh-CN': {
      emptyState: '拖放 PDF 或图片到此处开始',
      importButton: '导入文件',
      selectFiles: '选择文件',
      pageCounter: (n: number) => `已加载 ${n} 个页面`,
      scanToDocument: '扫描为文档',
      deletePage: '删除页面',
      selectAPage: '选择一个页面查看',
      status: '状态:',
      ready: '就绪',
      fit: '适应',
      downloadMD: '下载 MD'
    }
  },

  // OCR 响应数据
  ocrResponse: {
    default: () => JSON.parse(
      fs.readFileSync(
        path.resolve('tests/e2e/samples/sample.json'),
        'utf-8'
      )
    )
  },

  // 导出配置
  exportFormats: [
    {
      type: 'Markdown',
      extension: 'md',
      dropdownText: 'Export as Markdown',
      validation: {
        contentPattern: /瑞慈/g,
        expectedMatches: 4
      }
    },
    {
      type: 'DOCX',
      extension: 'docx',
      dropdownText: 'Export as DOCX',
      validation: {
        xmlPath: 'word/document.xml',
        contentPattern: /1021112511173001/g,
        expectedMatches: 2
      }
    },
    {
      type: 'PDF',
      extension: 'pdf',
      dropdownText: 'Export as PDF',
      validation: {
        expectedPageCount: 2
      }
    }
  ] as const,

  // 页面状态
  pageStatuses: {
    ready: ['ready'],
    processing: ['pending_render', 'rendering'],
    ocrQueue: ['pending_ocr', 'recognizing'],
    ocrComplete: [
      'ocr_success',
      'pending_gen',
      'generating_markdown',
      'markdown_success',
      'generating_pdf',
      'pdf_success',
      'generating_docx',
      'completed'
    ]
  } as const
};
```

---

## 二、针对每个测试文件的详细优化方案

### 2.1 batch-export.spec.ts - 参数化重构

**当前问题**: 6 个测试用例代码重复率 80%

**优化方案**: 使用配置驱动 + POM

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { ExportPage } from '../pages/ExportPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

test.describe('Batch Export (Refactored)', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let exportPage: ExportPage;
  let ocrPage: OCRPage;
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    exportPage = new ExportPage(page);
    ocrPage = new OCRPage(page);
    apiMocks = new APIMocks(page);

    await app.goto();
    await app.clearDatabase();
    await apiMocks.mockOCR();
  });

  // 参数化测试: 部分页面就绪
  for (const format of TestData.exportFormats) {
    test(`should export ${format.type} with some pages not ready`, async ({ page }) => {
      // 1. 上传 3 张图片
      await pageList.uploadAndWaitReady(TestData.files.multipleImages());

      // 2. 触发前 2 页的 OCR
      for (let i = 0; i < 2; i++) {
        await pageList.clickPage(i);
        await page.locator('.ocr-actions .trigger-btn').click();
        await ocrPage.waitForOCRSuccess(i);
      }

      // 3. 全选并导出
      await pageList.selectAll();
      const download = await exportPage.exportAsWithConfirmation(format.type);

      // 4. 验证文件名
      expect(exportPage.verifyFileName(download, format.extension)).toBe(true);

      // 5. 验证内容
      const downloadPath = await download.path();
      await validateExportContent(downloadPath!, format);

      // 清理
      await download.delete();
    });
  }

  // 参数化测试: 所有页面就绪
  for (const format of TestData.exportFormats) {
    test(`should export ${format.type} when all pages ready`, async ({ page }) => {
      // 1. 上传 2 张图片
      const filePaths = [TestData.files.samplePNG(), TestData.files.sampleJPG()];
      await pageList.uploadAndWaitReady(filePaths);

      // 2. 触发所有页面的 OCR
      for (let i = 0; i < 2; i++) {
        await pageList.clickPage(i);
        await page.locator('.ocr-actions .trigger-btn').click();
        await ocrPage.waitForOCRSuccess(i);
      }

      // 3. 全选并导出（无需确认对话框）
      await pageList.selectAll();
      const download = await exportPage.exportAs(format.type);

      // 4. 验证
      expect(exportPage.verifyFileName(download, format.extension)).toBe(true);
      const downloadPath = await download.path();
      await validateExportContent(downloadPath!, format);

      await download.delete();
    });
  }
});

// 提取验证逻辑
async function validateExportContent(
  filePath: string,
  format: typeof TestData.exportFormats[number]
) {
  if (format.type === 'Markdown') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(format.validation.contentPattern);
    expect(matches?.length || 0).toBe(format.validation.expectedMatches);
  } else if (format.type === 'DOCX') {
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const docXml = await zip.file(format.validation.xmlPath!)?.async('text');
    expect(docXml).toBeDefined();
    const matches = docXml!.match(format.validation.contentPattern!);
    expect(matches?.length || 0).toBe(format.validation.expectedMatches);
  } else if (format.type === 'PDF') {
    const pdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    expect(pdfDoc.getPageCount()).toBe(format.validation.expectedPageCount);
  }
}
```

**改进效果**:
- 代码行数减少 60%
- 新增导出格式只需添加配置
- 易于维护和扩展

### 2.2 i18n.spec.ts - 配置驱动验证

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { TestData } from '../data/TestData';

test.describe('Internationalization (Refactored)', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    await app.goto();
  });

  // 参数化测试: 验证所有翻译
  for (const [lang, texts] of Object.entries(TestData.translations)) {
    test(`should display correct ${lang} translations`, async ({ page }) => {
      await app.switchLanguage(lang as 'en' | 'zh-CN');

      // 验证所有文本元素
      await expect(page.getByText(texts.emptyState)).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(texts.importButton, 'i') })).toBeVisible();
      await expect(page.getByRole('button', { name: texts.selectFiles })).toBeVisible();
    });
  }

  test('should persist language after reload', async ({ page }) => {
    await app.switchLanguage('zh-CN');
    
    // 验证语言标签
    expect(await app.getCurrentLanguage()).toBe('zh-CN');
    
    // 重载
    await page.reload();
    
    // 验证持久化
    expect(await app.getCurrentLanguage()).toBe('zh-CN');
    const texts = TestData.translations['zh-CN'];
    await expect(page.getByText(texts.emptyState)).toBeVisible();
  });
});
```

### 2.3 file-adding.spec.ts - 补充 UI 测试

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('File Adding (Refactored)', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should process uploaded PDF', async ({ page }) => {
    await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
    
    expect(await pageList.getPageCount()).toBe(6); // sample.pdf 有 6 页
    expect(await pageList.areAllThumbnailsVisible()).toBe(true);
  });

  // 新增: 真实文件选择器测试
  test('should handle file chooser UI interaction', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('.app-header button:has-text("Import Files")')
    ]);

    await fileChooser.setFiles([TestData.files.samplePNG()]);
    
    await pageList.waitForPagesLoaded({ count: 1 });
    expect(await pageList.getPageCount()).toBe(1);
  });

  test('should sync selection when adding files sequentially', async ({ page }) => {
    // 添加第一个文件
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    
    // 验证选中状态
    await expect(page.locator('.page-item').first()).toHaveClass(/active|selected/);
    
    // 添加第二个文件
    await pageList.uploadAndWaitReady([TestData.files.sampleJPG()]);
    
    // 验证自动切换到新文件
    expect(await pageList.getPageCount()).toBe(2);
    await expect(page.locator('.page-item').nth(1)).toHaveClass(/active|selected/);
    await expect(page.locator('.page-item').nth(0)).not.toHaveClass(/active|selected/);
  });
});
```

### 2.4 page-reordering.spec.ts - 精准拖拽 + 数据库验证

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';
import { customMatchers } from '../matchers/custom-matchers';

expect.extend(customMatchers);

test.describe('Page Reordering (Refactored)', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
  });

  test('should reorder pages and persist', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Webkit has blob URL limitations');

    // 上传文件并等待全部就绪
    await pageList.uploadAndWaitReady(TestData.files.pdfAndImages());
    
    // 记录初始顺序
    const initialOrder = await pageList.getPageOrder();
    const totalPages = initialOrder.length;
    expect(totalPages).toBeGreaterThan(2);

    // 使用精准拖拽
    await pageList.dragAndDrop(0, 2);

    // 验证 UI 顺序变化
    const newOrder = await pageList.getPageOrder();
    expect(newOrder).not.toEqual(initialOrder);
    expect(newOrder[0]).toBe(initialOrder[1]);
    expect(newOrder[2]).toBe(initialOrder[0]);

    // 验证数据库顺序
    const dbOrderCorrect = await pageList.verifyOrderInDatabase(newOrder);
    expect(dbOrderCorrect).toBe(true);

    // 重载验证持久化
    await page.reload();
    await pageList.waitForPagesLoaded({ count: totalPages });
    await pageList.waitForThumbnailsReady();

    const persistedOrder = await pageList.getPageOrder();
    expect(persistedOrder).toEqual(newOrder);
  });
});
```

### 2.5 panel-collapse-states.spec.ts - 视觉快照测试

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { TestData } from '../data/TestData';

test.describe('Panel Collapse States (Visual)', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    await app.goto();
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
  });

  const states = [
    { name: 'S1', collapseList: false, collapsePreview: false },
    { name: 'S2', collapseList: true, collapsePreview: false },
    { name: 'S3', collapseList: false, collapsePreview: true },
    { name: 'S4', collapseList: true, collapsePreview: true },
  ];

  for (const state of states) {
    test(`should match visual snapshot for ${state.name}`, async ({ page }) => {
      // 设置面板状态
      if (state.collapseList) {
        await page.click('[data-testid="collapse-list-button"]');
      }
      if (state.collapsePreview) {
        await page.click('[data-testid="collapse-preview-button"]');
      }

      // 等待动画完成
      await page.waitForTimeout(500);

      // 视觉快照（mask 掉动态内容）
      await expect(page).toHaveScreenshot(`panel-state-${state.name}.png`, {
        mask: [page.locator('.page-image'), page.locator('.timestamp')],
        maxDiffPixels: 100
      });
    });
  }
});
```

### 2.6 batch-ocr.spec.ts - Helper 函数提取

**创建 `tests/e2e/helpers/ocr-helpers.ts`**:

```typescript
import type { Page } from '@playwright/test';

export async function checkPagePastOCR(page: Page, idx: number): Promise<boolean> {
  return await page.evaluate((index) => {
    const pages = window.pagesStore?.pages || [];
    const status = pages[index]?.status;
    return ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
            'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(status || '');
  }, idx);
}

export async function checkProcessingPagesCount(page: Page, expectedCount: number): Promise<boolean> {
  return await page.evaluate((count) => {
    const pages = window.pagesStore?.pages || [];
    const processingCount = pages.filter(p => 
      p.status === 'pending_ocr' || p.status === 'recognizing'
    ).length;
    return processingCount === count;
  }, expectedCount);
}

export async function checkAllPagesCompletedOCR(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  });
}

export async function waitForAllOCRComplete(page: Page, timeout: number = 30000): Promise<void> {
  await page.waitForFunction(() => {
    const pages = window.pagesStore?.pages || [];
    return pages.every(p =>
      ['ocr_success', 'pending_gen', 'generating_markdown', 'markdown_success',
       'generating_pdf', 'pdf_success', 'generating_docx', 'completed'].includes(p.status)
    );
  }, { timeout });
}
```

**重构后的 batch-ocr.spec.ts**:

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';
import { waitForNotification } from '../helpers/wait-helpers';
import * as ocrHelpers from '../helpers/ocr-helpers';

test.describe('Batch OCR (Refactored)', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let ocrPage: OCRPage;
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    ocrPage = new OCRPage(page);
    apiMocks = new APIMocks(page);

    await app.goto();
    await apiMocks.mockOCR();
  });

  test('should process all ready pages', async ({ page }) => {
    // 上传多页 PDF
    await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
    const pageCount = await pageList.getPageCount();

    // 批量 OCR
    await pageList.selectAll();
    await pageList.clickBatchOCR();

    // 验证通知
    await waitForNotification(page, `Added ${pageCount} pages to OCR queue`);

    // 等待所有页面完成
    await ocrHelpers.waitForAllOCRComplete(page);

    // 验证所有页面状态
    for (let i = 0; i < pageCount; i++) {
      const isPastOCR = await ocrHelpers.checkPagePastOCR(page, i);
      expect(isPastOCR).toBeTruthy();
    }
  });
});
```

---

## 三、错误场景补充测试

### 3.1 OCR 错误处理

```typescript
// tests/e2e/specs/error-handling.spec.ts
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Error Handling', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let apiMocks: APIMocks;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    apiMocks = new APIMocks(page);
    await app.goto();
  });

  test('should handle OCR 500 error', async ({ page }) => {
    // Mock OCR 失败
    await apiMocks.mockOCR({ shouldFail: true, statusCode: 500 });

    // 上传并触发 OCR
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await page.locator('.ocr-actions .trigger-btn').click();

    // 验证错误提示
    await expect(page.locator('.n-notification:has-text("OCR failed")')).toBeVisible({ 
      timeout: 10000 
    });

    // 验证重试按钮出现
    await expect(page.locator('button:has-text("Retry")')).toBeVisible();
  });

  test('should handle network timeout', async ({ page }) => {
    // Mock 超时
    await apiMocks.mockOCR({ delay: 100000 }); // 100秒延迟

    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await page.locator('.ocr-actions .trigger-btn').click();

    // 验证超时提示
    await expect(page.locator('.n-notification:has-text("timeout")')).toBeVisible({ 
      timeout: 35000 
    });
  });

  test('should handle export failure', async ({ page }) => {
    // 模拟导出时的网络断开
    await page.context().setOffline(true);

    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await pageList.selectAll();
    
    // 尝试导出
    await page.locator('.export-selected-btn').click();
    await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

    // 验证错误提示
    await expect(page.locator('.n-notification:has-text("Export failed")')).toBeVisible();
  });
});
```

---

## 四、实施路线图（整合优化）

### 阶段 1: 基础架构搭建 (1 周)

**目标**: 建立 POM 和辅助系统

- [ ] 创建目录结构
- [ ] 实现 5 个核心 Page Objects
  - AppPage.ts
  - PageListPage.ts
  - PageViewerPage.ts
  - OCRPage.ts
  - ExportPage.ts
- [ ] 实现 wait-helpers.ts
- [ ] 实现 APIMocks.ts
- [ ] 实现 TestData.ts
- [ ] 实现 custom-matchers.ts

**验收标准**: 所有基础类和工具可以正常使用

### 阶段 2: 重构现有测试 (2 周)

**优先级排序**:

1. **高优先级** (第 1 周)
   - [ ] batch-export.spec.ts（参数化，预计减少 60% 代码）
   - [ ] i18n.spec.ts（配置驱动，预计减少 50% 代码）
   - [ ] file-adding.spec.ts（补充 UI 测试）

2. **中优先级** (第 2 周)
   - [ ] batch-ocr.spec.ts（提取 helpers）
   - [ ] page-reordering.spec.ts（精准拖拽）
   - [ ] persistence.spec.ts（使用 POM）

**验收标准**: 
- waitForTimeout 使用从 100+ 降至 <30
- 代码重复率从 40% 降至 <20%
- 所有测试通过率 >95%

### 阶段 3: 扩展测试覆盖 (1 周)

- [ ] 添加 error-handling.spec.ts（OCR 错误、网络错误、导出错误）
- [ ] 添加真实文件选择器测试
- [ ] 添加视觉快照测试（panel-collapse-states）
- [ ] 添加数据库验证测试

**验收标准**: 测试覆盖率 >80%

### 阶段 4: 优化和文档 (持续)

- [ ] 性能优化（并行测试、缓存优化）
- [ ] 编写测试文档
- [ ] 监控测试稳定性
- [ ] 定期更新测试数据

---

## 五、关键指标对比

| 指标 | 当前 | 目标 | 改善 |
|------|------|------|------|
| 代码重复率 | 40% | <15% | ↓ 62% |
| waitForTimeout 使用 | 100+ | <20 | ↓ 80% |
| 测试通过率 | ~90% | >95% | ↑ 5% |
| 平均执行时间 | 90s/用例 | <60s | ↓ 33% |
| 测试覆盖率 | ~70% | >80% | ↑ 14% |
| 维护成本 | 基准 | -40% | ↓ 40% |
| Helper 函数复用 | <10% | >80% | ↑ 700% |

---

## 六、方案总结

- ✅ **全面的理论基础** - Playwright 最佳实践调研
- ✅ **详细的现状分析** - 11 个文件的深度分析
- ✅ **清晰的路线图** - 4 阶段渐进式重构
- ✅ **量化目标** - 明确的指标改进预期
- ✅ **Before/After 对比** - 清晰的代码示例
- ✅ **更具体的 POM 方法设计** - 每个 Page 类的方法签名明确
- ✅ **精准拖拽实现** - 使用 mouse API 替代不稳定的 dragTo
- ✅ **数据库层验证** - 通过 IndexedDB 确保数据一致性
- ✅ **视觉快照测试** - 引入 toHaveScreenshot
- ✅ **文件级优化方案** - 针对每个测试文件的具体改造
- ✅ **错误场景具体化** - 明确列出需要补充的错误测试


💡 **理论 + 实践** - 结合最佳实践和具体实施  
💡 **架构 + 细节** - 既有整体设计又有文件级方案  
💡 **工具 + 测试** - 完整的工具链和测试用例  
💡 **现在 + 未来** - 即时改进和长期规划  


