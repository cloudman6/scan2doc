# Playwright E2E 测试重构实施指南

## 📑 快速导航

- [第 0 阶段：准备工作](#第-0-阶段准备工作-1-天) - 环境准备和目录创建
- [第 1 阶段：搭建基础架构](#第-1-阶段搭建基础架构-3-4-天) - POM、Helpers、Mocks
- [第 2 阶段：重构现有测试](#第-2-阶段重构现有测试-7-10-天) - 测试文件逐个重构
- [第 3 阶段：新增测试](#第-3-阶段新增测试和补充覆盖-2-3-天) - 错误处理、并发、边界
- [第 4 阶段：清理和优化](#第-4-阶段清理和优化-2-3-天) - 性能优化、文档完善
- [第 5 阶段：验证和发布](#第-5-阶段验证和发布-1-2-天) - 最终验证、创建 PR
- [进度跟踪表](#进度跟踪表) - 任务清单和时间记录
- [成功标准](#成功标准) - 验收标准
- [风险管理](#风险管理) - 常见问题解决

## 🎯 实施原则

1. **小步快跑**: 每次只改动一小部分，确保随时可提交
2. **测试先行**: 每个改动都要确保现有测试通过
3. **渐进式重构**: 新旧并存，逐步替换
4. **双重验证**: 重构后的测试要与原测试结果一致
5. **文档同步**: 每个阶段都要更新文档
6. **及时反馈**: 遇到问题及时沟通，不要单独钻研过久

---

## 🔄 第 0 阶段：准备工作 (1 天)

### 0.1 确保所有现有测试通过

```bash

# 确保所有现有测试通过
npm run test:e2e

```

**验收标准**:
- ✅ 所有现有测试通过率

### 0.2 创建目录结构

```bash
# 创建新的目录结构（与架构设计文档一致）
mkdir -p tests/e2e/pages
mkdir -p tests/e2e/helpers
mkdir -p tests/e2e/mocks
mkdir -p tests/e2e/mocks/responses
mkdir -p tests/e2e/data
mkdir -p tests/e2e/matchers
mkdir -p tests/e2e/fixtures
mkdir -p tests/e2e/utils
mkdir -p scripts

# 验证目录创建成功
ls -la tests/e2e/
```

**最终目录结构应为**:
```
tests/e2e/
├── pages/          # Page Object Models
├── helpers/        # 辅助函数
├── mocks/          # API Mock 封装
│   └── responses/  # Mock 响应数据
├── data/           # 测试数据管理
├── matchers/       # 自定义断言
├── fixtures/       # 测试 Fixtures
├── utils/          # 工具函数
├── specs/          # 测试用例（已存在）
└── samples/        # 测试样本文件（已存在）

scripts/            # 性能分析等脚本
```

**验收标准**:
- ✅ 所有目录已创建
- ✅ 目录结构符合设计文档
- ✅ 没有权限问题

### 0.3 设置开发环境

```bash
# 安装依赖（如果需要）
npm install --save-dev @playwright/test@latest

# 配置 TypeScript 路径别名（可选）
# 在 tsconfig.json 中添加：
# "paths": {
#   "@e2e-pages/*": ["tests/e2e/pages/*"],
#   "@e2e-helpers/*": ["tests/e2e/helpers/*"]
# }
```

---

## 🏗️ 第 1 阶段：搭建基础架构 (3-4 天)

### Day 1: 核心工具类和 Fixtures

#### 1.0 创建 base-test.ts Fixture (1 小时)

**文件**: `tests/e2e/fixtures/base-test.ts`

```typescript
import { test as base } from '@playwright/test';

// 扩展 base test，后续可以添加自定义 fixtures
export const test = base.extend<{}>({
  // 未来可以添加：
  // app: async ({ page }, use) => { ... },
  // pageList: async ({ page }, use) => { ... }
});

export { expect } from '@playwright/test';
```

**验收标准**:
- ✅ base-test.ts 创建完成
- ✅ 可以被其他测试文件导入
- ✅ TypeScript 类型检查通过

#### 1.1 创建 TestData.ts (2 小时)

**文件**: `tests/e2e/data/TestData.ts`

**完整实现** (参考架构设计文档):
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
      // ... 完整的翻译键值对
    },
    'zh-CN': {
      emptyState: '拖放 PDF 或图片到此处开始',
      importButton: '导入文件',
      selectFiles: '选择文件',
      // ... 完整的翻译键值对
    }
  },

  // 导出配置
  exportFormats: [
    {
      type: 'Markdown',
      extension: 'md',
      dropdownText: 'Export as Markdown',
    },
    {
      type: 'DOCX',
      extension: 'docx',
      dropdownText: 'Export as DOCX',
    },
    {
      type: 'PDF',
      extension: 'pdf',
      dropdownText: 'Export as PDF',
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

**验收标准**:
- ✅ TestData.ts 完整实现
- ✅ 所有路径可以正确解析
- ✅ 导出格式配置完整
- ✅ 国际化数据完整

#### 1.2 创建 wait-helpers.ts (3 小时)

**文件**: `tests/e2e/helpers/wait-helpers.ts`

**步骤**:
1. 实现 `waitForStoreState`
2. 实现 `waitForPageStatus`
3. 实现 `waitForNotification`
4. 添加 JSDoc 注释

**验证方式**:
```typescript
// 在一个现有测试中临时使用新的 helper
import { waitForPageStatus } from '../helpers/wait-helpers';

test('test new helper', async ({ page }) => {
  // ... 
  await waitForPageStatus(page, 0, 'ready');
});
```

**验收标准**:
- ✅ 所有 helper 函数实现完成
- ✅ 在实际测试中验证可用
- ✅ TypeScript 类型检查通过

#### 1.3 创建 custom-matchers.ts (2 小时)

**文件**: `tests/e2e/matchers/custom-matchers.ts`

**步骤**:
1. 实现 `toHavePageStatus`
2. 实现 `toHaveConsistentOrder`
3. 实现 `toHaveDatabaseOrder`
4. 实现 `toHaveAllThumbnails`
5. 在 `base-test.ts` 中注册

**完整实现**: 参考架构设计文档 1.3 节

**测试**:
```typescript
// 临时测试
test('test custom matcher', async ({ page }) => {
  await expect(page).toHavePageStatus(0, 'ready');
});
```

**验收标准**:
- ✅ Matchers 实现完成
- ✅ 类型提示正常
- ✅ 测试验证通过

#### 1.4 创建文件上传工具函数 (1 小时)

**文件**: `tests/e2e/utils/file-upload.ts`

```typescript
import type { Page } from '@playwright/test';

/**
 * 上传文件到应用
 */
export async function uploadFiles(page: Page, filePaths: string[]) {
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.app-header button:has-text("Import Files")')
  ]);
  
  await fileChooser.setFiles(filePaths);
}
```

**验收标准**:
- ✅ uploadFiles 函数实现
- ✅ 支持单个和多个文件
- ✅ 在测试中验证可用


---

### Day 2: Mock 系统

#### 2.1 创建 APIMocks.ts (3 小时)

**文件**: `tests/e2e/mocks/APIMocks.ts`

**步骤**:
1. 实现基础 Mock 类
2. 实现 `mockOCR()` 方法
3. 实现 `mockOCRWithControl()` 方法
4. 添加配置选项（delay, shouldFail）

**测试**:
```typescript
// 在现有 batch-ocr.spec.ts 中测试
import { APIMocks } from '../mocks/APIMocks';

test.beforeEach(async ({ page }) => {
  const apiMocks = new APIMocks(page);
  await apiMocks.mockOCR();
});
```

**验收标准**:
- ✅ APIMocks 类实现完成
- ✅ 在现有测试中验证可用
- ✅ 所有配置选项工作正常


---

### Day 3-4: Page Object Models (核心)

**重要**: 实现顺序按照依赖关系，从简单到复杂

#### 3.1 创建 AppPage.ts (2 小时)

**文件**: `tests/e2e/pages/AppPage.ts`

**实现优先级**:
1. 基础方法: `goto()`, `waitForAppReady()`
2. 数据库方法: `clearDatabase()`
3. 语言方法: `getCurrentLanguage()`, `switchLanguage()`

**渐进式验证**:
```typescript
// 在 app.spec.ts 中逐步替换
import { AppPage } from '../pages/AppPage';

test('smoke test with POM', async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await app.waitForAppReady();
  // ... 现有断言
});
```

**验收标准**:
- ✅ 所有方法实现完成
- ✅ 在一个测试中完整验证
- ✅ 不破坏现有测试

#### 3.2 创建 PageListPage.ts (4 小时) ⭐ 重点

**文件**: `tests/e2e/pages/PageListPage.ts`

**实现策略**: 分批实现，逐步验证

**第一批** (1.5 小时):
- `getPageCount()`
- `getPageOrder()`
- `clickPage()`
- `waitForPagesLoaded()`

**验证**:
```typescript
test('test PageListPage basic methods', async ({ page }) => {
  const pageList = new PageListPage(page);
  await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
  
  const count = await pageList.getPageCount();
  expect(count).toBeGreaterThan(0);
});
```

**第二批** (1.5 小时):
- `selectAll()`
- `unselectAll()`
- `clickBatchOCR()`
- `waitForThumbnailsReady()`

**第三批** (1 小时) - 精准拖拽:
- `dragAndDrop()` - 使用 mouse API

**测试精准拖拽**:
```typescript
test('test drag and drop', async ({ page }) => {
  const pageList = new PageListPage(page);
  await pageList.uploadAndWaitReady(TestData.files.pdfAndImages());
  
  const before = await pageList.getPageOrder();
  await pageList.dragAndDrop(0, 2);
  const after = await pageList.getPageOrder();
  
  expect(after).not.toEqual(before);
});
```

**验收标准**:
- ✅ 所有方法实现完成
- ✅ 拖拽功能在三个浏览器都稳定
- ✅ 数据库验证方法正常工作

#### 3.3 创建 OCRPage.ts (2 小时)

**文件**: `tests/e2e/pages/OCRPage.ts`

**实现**:
- `waitForOCRSuccess()`
- `waitForAllOCRComplete()`
- `getPageStatus()`
- `hasProcessingPages()`

**验证**:
```typescript
test('test OCRPage methods', async ({ page }) => {
  const pageList = new PageListPage(page);
  const ocrPage = new OCRPage(page);
  
  await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
  await page.locator('.ocr-actions .trigger-btn').click();
  await ocrPage.waitForOCRSuccess(0);
  
  expect(await ocrPage.getPageStatus(0)).toMatch(/ocr_success|completed/);
});
```

#### 3.4 创建 ExportPage.ts (2 小时)

**文件**: `tests/e2e/pages/ExportPage.ts`

**实现**:
- `exportAs()`
- `exportAsWithConfirmation()`
- `verifyFileName()`

**完整实现**: 参考架构设计文档 1.1.4 节

**验证**: 在 batch-export.spec.ts 中测试

#### 3.5 创建 PageViewerPage.ts (1.5 小时)

**文件**: `tests/e2e/pages/PageViewerPage.ts`

```typescript
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
}
```

**验收标准**:
- ✅ PageViewerPage 实现完成
- ✅ 在测试中验证图片加载
- ✅ 状态文本获取正常

#### 3.6 创建 PreviewPage.ts (1.5 小时)

**文件**: `tests/e2e/pages/PreviewPage.ts`

```typescript
import type { Page } from '@playwright/test';

export class PreviewPage {
  constructor(private page: Page) {}

  /**
   * 获取预览面板容器
   */
  private get container() {
    return this.page.locator('.preview-panel');
  }

  /**
   * 检查预览面板是否可见
   */
  async isVisible(): Promise<boolean> {
    return await this.container.isVisible();
  }

  /**
   * 点击折叠按钮
   */
  async toggleCollapse() {
    await this.page.click('[data-testid="collapse-preview-button"]');
  }

  /**
   * 检查是否已折叠
   */
  async isCollapsed(): Promise<boolean> {
    const classList = await this.container.getAttribute('class');
    return classList?.includes('collapsed') || false;
  }

  /**
   * 获取预览内容
   */
  async getPreviewContent(): Promise<string> {
    return await this.container.locator('.preview-content').textContent() || '';
  }
}
```

**验收标准**:
- ✅ PreviewPage 实现完成
- ✅ 折叠/展开功能正常
- ✅ 内容获取正常


**验收标准**:
- ✅ 6 个 Page Object 全部完成
- ✅ 每个 Page 都在实际测试中验证过
- ✅ TypeScript 类型安全
- ✅ 所有现有测试仍然通过

---

## 🔧 第 2 阶段：重构现有测试 (7-10 天)

### Week 2, Day 1-2: 重构 batch-export.spec.ts

#### 步骤 1: 创建重构版本 (3 小时)

**策略**: 创建新文件，保留旧文件

```bash
# 创建新版本
cp tests/e2e/specs/batch-export.spec.ts \
   tests/e2e/specs/batch-export.refactored.spec.ts
```

**编辑 `batch-export.refactored.spec.ts`**:

```typescript
// 1. 导入 POM 和工具
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { ExportPage } from '../pages/ExportPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

// 2. 使用参数化测试
for (const format of TestData.exportFormats) {
  test(`should export ${format.type} with some pages not ready`, async ({ page }) => {
    // 使用 POM
  });
}
```

#### 步骤 2: 对比测试 (1 小时)

```bash
# 同时运行两个版本
npm run test:e2e -- batch-export.spec.ts
npm run test:e2e -- batch-export.refactored.spec.ts

# 对比结果
```

#### 步骤 3: 替换 (30 分钟)

```bash
# 确认新版本通过后，重命名旧文件（使用 .bak 避免 TypeScript 编译）
mv tests/e2e/specs/batch-export.spec.ts \
   tests/e2e/specs/batch-export.spec.ts.bak

mv tests/e2e/specs/batch-export.refactored.spec.ts \
   tests/e2e/specs/batch-export.spec.ts
```

#### 步骤 4: 清理 (30 分钟)

```bash
# 运行完整测试套件
npm run test:e2e

# 确认无问题后删除备份文件
rm tests/e2e/specs/batch-export.spec.ts.bak

# 或者保留备份一段时间，在最终验证后统一删除
```


**验收标准**:
- ✅ 新版本测试全部通过
- ✅ 测试执行时间没有显著增加
- ✅ 代码行数减少 60%
- ✅ 测试覆盖率保持不变

---

### Week 2, Day 3: 重构 i18n.spec.ts (4 小时)

**同样的策略**: 创建 -> 对比 -> 替换 -> 清理

```typescript
// 使用配置驱动
for (const [lang, texts] of Object.entries(TestData.translations)) {
  test(`should display correct ${lang} translations`, async ({ page }) => {
    const app = new AppPage(page);
    await app.switchLanguage(lang as 'en' | 'zh-CN');
    await expect(page.getByText(texts.emptyState)).toBeVisible();
  });
}
```


---

### Week 2, Day 4: 重构 file-adding.spec.ts (4 小时)

**重点**: 补充文件选择器 UI 测试

```typescript
// 新增测试
test('should handle file chooser UI interaction', async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.app-header button:has-text("Import Files")')
  ]);
  
  await fileChooser.setFiles([TestData.files.samplePNG()]);
  // ...
});
```


---

### Week 2, Day 5: 重构 page-reordering.spec.ts (4 小时)

**重点**: 使用精准拖拽 + 数据库验证

```typescript
test('should reorder pages with precise drag', async ({ page }) => {
  const pageList = new PageListPage(page);
  await pageList.uploadAndWaitReady(TestData.files.pdfAndImages());
  
  const before = await pageList.getPageOrder();
  
  // 使用精准拖拽
  await pageList.dragAndDrop(0, 2);
  
  const after = await pageList.getPageOrder();
  expect(after).not.toEqual(before);
  
  // 数据库验证
  const dbValid = await pageList.verifyOrderInDatabase(after);
  expect(dbValid).toBe(true);
});
```


---

### Week 3, Day 1-2: 重构 batch-ocr.spec.ts (6 小时)

**步骤**:

1. **提取 Helper 函数** (2 小时)

**文件**: `tests/e2e/helpers/ocr-helpers.ts`

**完整实现** (参考架构设计文档 2.6 节):
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

**验证**:
```typescript
// 在临时测试中验证
test('test ocr helpers', async ({ page }) => {
  // ... 上传文件并触发 OCR
  const isPastOCR = await checkPagePastOCR(page, 0);
  expect(isPastOCR).toBeTruthy();
});
```

2. **使用 POM 重写测试** (3 小时)
   
参考架构设计文档 2.6 节的重构后代码：
```typescript
import { OCRPage } from '../pages/OCRPage';
import * as ocrHelpers from '../helpers/ocr-helpers';
import { waitForNotification } from '../helpers/wait-helpers';
```

3. **简化复杂测试** (1 小时)
   - 使用 APIMocks 的控制功能
   - 减少硬编码等待
   - 使用 helper 函数替代重复代码


**验收标准**:
- ✅ ocr-helpers.ts 完整实现
- ✅ batch-ocr.spec.ts 使用新的 helpers
- ✅ 代码重复减少 35%
- ✅ 所有测试通过

---

### Week 3, Day 3: 重构 persistence.spec.ts (3 小时)

**简单重构**: 主要是使用 POM

```typescript
const app = new AppPage(page);
const pageList = new PageListPage(page);

await app.goto();
await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);

// 重载
await page.reload();

// 验证持久化
await pageList.waitForPagesLoaded({ count: 6 });
```

---

### Week 3, Day 4: 重构 panel-collapse-states.spec.ts (4 小时)

**重点**: 使用视觉快照测试

**步骤**:

1. **引入 POM** (1 小时)
```typescript
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { PreviewPage } from '../pages/PreviewPage';
```

2. **实现视觉快照测试** (2 小时)

参考架构设计文档 2.5 节：
```typescript
test.describe('Panel Collapse States (Visual)', () => {
  let app: AppPage;
  let pageList: PageListPage;
  let preview: PreviewPage;

  test.beforeEach(async ({ page }) => {
    app = new AppPage(page);
    pageList = new PageListPage(page);
    preview = new PreviewPage(page);
    
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
        await preview.toggleCollapse();
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

3. **生成基线快照** (30 分钟)
```bash
# 首次运行生成基线
npm run test:e2e -- panel-collapse-states.spec.ts --update-snapshots

# 验证快照已生成
ls tests/e2e/specs/*.png
```

4. **验证快照测试** (30 分钟)
```bash
# 运行快照测试
npm run test:e2e -- panel-collapse-states.spec.ts
```


**验收标准**:
- ✅ 视觉快照测试实现
- ✅ 4 个状态快照生成
- ✅ 快照测试稳定通过

### Week 3, Day 5: 批量更新其他测试 (4 小时)

更新剩余的测试文件:

1. **order-integrity.spec.ts** (1 小时)
   - 使用 PageListPage.ts 的顺序验证方法
   - 使用数据库验证

2. **page-deleting.spec.ts** (1 小时)
   - 使用 PageListPage.deleteSelected()
   - 使用 waitForNotification

3. **pagelist-ui-interacting.spec.ts** (1.5 小时)
   - 使用 PageListPage 的选择方法
   - 添加更多 UI 交互测试

4. **app.spec.ts, pdf-to-images-render.spec.ts** (30 分钟)
   - 快速应用 POM
   - 不做大幅修改

**策略**: 
- 使用已有的 POM 和 helpers
- 重点是替换重复代码
- 保持测试逻辑不变


---

## 🆕 第 3 阶段：新增测试和补充覆盖 (2-3 天)

### Week 4, Day 1: 错误处理测试 (全天 6 小时)

**文件**: `tests/e2e/specs/error-handling.spec.ts`

**完整实现** (参考架构设计文档第 3.1 节):

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';
import { APIMocks } from '../mocks/APIMocks';
import { TestData } from '../data/TestData';

test.describe('Error Handling', () => {
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

  test('should handle export failure gracefully', async ({ page }) => {
    // 上传文件
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await pageList.selectAll();
    
    // 模拟导出时的网络断开
    await page.context().setOffline(true);
    
    // 尝试导出
    await page.locator('.export-selected-btn').click();
    await page.locator('.n-dropdown-option:has-text("Export as Markdown")').click();

    // 验证错误提示
    await expect(page.locator('.n-notification:has-text("Export failed")')).toBeVisible({
      timeout: 10000
    });

    // 恢复网络
    await page.context().setOffline(false);
  });
});
```

**实现步骤**:

1. **OCR 错误测试** (2 小时)
   - 实现 500 错误测试
   - 实现超时测试
   - 验证错误提示和恢复机制

2. **导出错误测试** (2 小时)
   - 实现网络断开测试
   - 验证错误提示
   - 测试恢复功能

3. **完善错误提示验证** (2 小时)
   - 验证通知内容准确性
   - 验证重试机制
   - 测试错误状态恢复

**验收标准**:
- ✅ 3+ 个错误场景测试通过
- ✅ 错误提示正确显示
- ✅ 用户可以恢复操作
- ✅ 没有未捕获的异常


**注**: 视觉快照测试已在 Week 3, Day 4 的 panel-collapse-states.spec.ts 重构中完成。

### Week 4, Day 2: 补充缺失的测试场景 (4 小时)

**目标**: 提高测试覆盖率，补充遗漏的场景

1. **补充文件选择器测试** (1 小时)
   - 在 file-adding.spec.ts 中已添加
   - 验证取消选择的情况
   - 验证多次选择文件

2. **补充并发操作测试** (1.5 小时)

**文件**: `tests/e2e/specs/concurrent-operations.spec.ts`

```typescript
import { test, expect } from '../fixtures/base-test';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';

test.describe('Concurrent Operations', () => {
  test('should handle adding files during OCR', async ({ page }) => {
    const pageList = new PageListPage(page);
    const ocrPage = new OCRPage(page);
    
    // 上传第一批文件并触发 OCR
    await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
    await page.locator('.ocr-actions .trigger-btn').click();
    
    // 在 OCR 过程中添加新文件
    await pageList.uploadAndWaitReady([TestData.files.sampleJPG()]);
    
    // 验证两个文件都存在
    expect(await pageList.getPageCount()).toBe(2);
    
    // 等待 OCR 完成
    await ocrPage.waitForAllOCRComplete();
  });
  
  test('should handle multiple export requests', async ({ page }) => {
    // 测试快速点击导出按钮的情况
    // 验证只触发一次导出
  });
});
```

3. **补充边界条件测试** (1.5 小时)

**文件**: `tests/e2e/specs/edge-cases.spec.ts`

```typescript
test.describe('Edge Cases', () => {
  test('should handle empty page list operations', async ({ page }) => {
    // 测试在没有页面时的各种操作
    // 全选、导出、OCR 等按钮应该被禁用
  });
  
  test('should handle very large PDF', async ({ page }) => {
    // 测试大文件处理
    // 验证进度显示
  });
  
  test('should handle rapid page reordering', async ({ page }) => {
    // 快速连续拖拽
    // 验证最终状态正确
  });
});
```


---

## 🧹 第 4 阶段：清理和优化 (2-3 天)

### Week 4, Day 3: 全局清理

#### 4.1 删除 waitForTimeout (2 小时)

```bash
# 查找所有 waitForTimeout
grep -r "waitForTimeout" tests/e2e/specs/

# 逐个替换为智能等待
```

**目标**: 从 100+ 次降至 <10 次

#### 4.2 统一代码风格 (1 小时)

```bash
# 运行 linter
npm run lint:fix

# 格式化代码
npm run format
```

## ✅ 第 5 阶段：验证和发布 (1-2 天)

### 7.1 完整测试套件验证 (半天)

#### 7.1.1 基础验证 (2 小时)

```bash
# 1. 运行所有测试（所有浏览器）
npm run test:e2e

# 2. 生成最终性能报告
npm run test:e2e -- --reporter=json > final-report.json

# 3. 统计测试数量
echo "总测试数: $(grep -c '"title"' final-report.json)"
```

**验收标准**:
- ✅ 测试通过率 
- ✅ 所有浏览器测试通过
- ✅ 无 TypeScript 错误

#### 7.1.2 稳定性验证 (3 小时)

```bash
# 运行 50 次确保稳定性（可以在 CI 中进行）
for i in {1..50}; do
  echo "=== Run $i/50 ==="
  npm run test:e2e || {
    echo "❌ Failed at run $i"
    break
  }
  echo "✅ Run $i passed"
done
```

**如果发现不稳定测试**:
1. 记录失败的测试名称
2. 增加该测试的等待时间
3. 检查是否需要添加 test.retry()
4. 重新验证

**验收标准**:
- ✅ 50 次运行成功率 ≥95%
- ✅ 没有完全随机的失败
- ✅ 偶发失败有明确原因
