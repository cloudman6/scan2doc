---
description: E2E test development workflow using Playwright. Use this for creating or updating end-to-end tests.
---

这是 **E2E 测试开发**的专用流程。它遵循 TDD 风格，并在发现 Bug 时无缝切换到 `/dev` @.agent/workflows/dev.md 流程进行修复。


---

## 📖 快速导航

### 🚀 工作流程（按顺序执行）
- [前置条件](#前置条件)
- [关键规则](#关键规则-critical-rules)
- [阶段 0：飞行前检查](#阶段-0飞行前检查必须通过)
- [阶段 1：E2E 环境准备](#阶段-1e2e-环境准备)
- [阶段 2：E2E 测试开发（TDD）](#阶段-2e2e-测试开发tdd-风格)
- [阶段 3：验证](#阶段-3验证)
- [阶段 4：文档记录](#阶段-4文档记录)

### 📚 详细指南（按需查阅）
- [架构设计详解](#️-架构设计详解) - POM、Helper、Mock 数据管理
- [最佳实践大全](#-最佳实践大全) - Playwright 官方推荐 + 项目规范
- [调试和优化](#-调试和优化) - 调试技巧、性能优化、常见问题
- [快速参考](#-快速参考) - 常用命令速查表

---

## 前置条件

- 已确定要测试的用户流程或功能
- 需求已清晰理解（新测试、Bug 复现、或测试更新）
- **依赖**：确保 Playwright 已安装并配置（`playwright.config.ts`）

---

## 关键规则 (Critical Rules)

**如果在执行本工作流的过程中 Skip (跳过) 或 Ignore (忽略) 了任何用例、Warning 或 Error，你必须明确告知用户并解释原因。**

这是一条硬性规定，旨在防止问题被静默处理。

---

## 阶段 0：飞行前检查（必须通过）

> 引用 `/dev` workflow @.agent/workflows/dev.md 的阶段 0，确保项目处于健康状态。

// turbo
1. **清理环境（防止进程残留）**
   ```bash
   npm run test:e2e:cleanup
   ```

// turbo
2. **运行所有单元测试**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
3. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
4. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - ❌ 如果阈值（针对每个文件）未达标，**报告用户并询问**：是否需要先修复？

✅ **只有所有检查通过（或用户选择继续）后才能进入阶段 1。**

### 阶段 0 问题修复流程

如果用户选择"修复"阶段 0 发现的问题：

1. **暂停当前 E2E 任务**：将其标记为待恢复状态。
2. **启动新的 `/dev` @.agent/workflows/dev.md 任务**：
   - 目标是修复阶段 0 中失败的特定项目（如修复测试、降低复杂度或补充覆盖率）。
   - 跳过该修复任务的阶段 0 检查，直接进入阶段 1-4。
   - 必须遵循完整的 TDD 循环。
3. **修复完成后**：
   - 返回 `/e2e` @.agent/workflows/e2e.md 任务。
   - 重新执行阶段 0 的全部检查以确保项目恢复健康。
   - 只有重新验证通过后，才允许进入阶段 1 进行环境准备。

---

## 阶段 1：E2E 环境准备

// turbo
1. **检查开发服务器**
   - 检查 `http://localhost:5173/` 是否已有服务器运行
   - **如果已运行** → 直接使用，记录为"复用模式"
   - **如果未运行** → 启动新服务器，记录为"新启动模式"
     ```bash
     npm run dev
     ```

2. **分析目标用户流程**
   - 明确要测试的用户旅程（User Journey）
   - 识别关键交互点（点击、输入、拖拽等）
   - 确定预期结果和断言点

3. **确定测试文件位置**
   - 测试文件放在 `tests/e2e/specs/` 目录下
   - 按功能模块命名（如 `file-processing.spec.ts`、`persistence.spec.ts`）

---

## 阶段 2：E2E 测试开发（TDD 风格）

### 红色阶段：先写失败的 E2E 测试

1. **创建或更新测试文件**
   - 沿用 Playwright 的 `test` 和 `expect` API 风格
   - **必须**使用从自定义 fixture 导出的版本：
     ```typescript
     import { test, expect } from '../fixtures/base-test';
     ```
   - 描述用户流程的每个步骤
   - 📖 **参考**：[测试结构规范](#测试结构规范) | [测试命名约定](#测试命名约定)

2. **使用聚焦模式开发**
   ```bash
   npx playwright test tests/e2e/specs/<file>.spec.ts --headed
   ```
   - 使用 `--headed` 可视化调试
   - 使用 `test.only(...)` 聚焦单个测试
   - 📖 **参考**：[调试技巧](#调试技巧)

3. **遵循架构设计原则**
   - 使用 Page Object 封装页面操作
   - 使用 Helper 函数处理复杂等待逻辑
   - 使用 Mock 数据加速测试
   - 📖 **参考**：[架构设计详解](#️-架构设计详解)

4. **应用最佳实践**
   - 优先使用面向用户的定位器（`getByRole`、`getByLabel`）
   - 使用智能等待，避免固定延迟
   - 确保测试独立性
   - 📖 **参考**：[最佳实践大全](#-最佳实践大全)

5. **确认测试因正确原因失败**
   - 如果是功能缺失 → 这是预期的红色状态
   - 如果是选择器问题 → 修复选择器

### 绿色阶段：让测试通过

**情况 A：测试通过（功能已存在）**
- 继续添加更多测试用例

**情况 B：需要修改应用代码**
- ⚠️ **切换到 `/dev` @.agent/workflows/dev.md 流程**：
  1. 暂停 E2E 测试开发
  2. 按照 `/dev` @.agent/workflows/dev.md 流程修复 Bug 或实现功能
  3. 确保单元测试覆盖
  4. 返回继续 E2E 测试
- 📖 **参考**：[与 /dev 流程的协作](#与-dev-流程的协作)

### 重构阶段：优化测试代码

1. **提取可复用的工具函数**
   - 常用操作封装到 `tests/e2e/utils/` 或 Page Object
   - 如：文件上传、页面导航
   - 📖 **参考**：[Helper 函数开发](#helper-函数开发)

2. **优化选择器**
   - 优先使用语义化定位器
   - 避免脆弱的 CSS 选择器
   - 📖 **参考**：[Locator 策略优先级](#locator-策略优先级)

3. **添加适当的等待和重试**
   - 使用 Playwright 的自动等待机制
   - 对于复杂异步操作，使用 `waitFor` 系列方法
   - 📖 **参考**：[智能等待策略](#智能等待策略)

---

## 阶段 3：验证

// turbo
1. **运行完整 E2E 测试套件**
   ```bash
   npm run test:e2e
   ```
   - ❌ 所有测试必须通过
   - 如果 E2E 测试失败 → 返回阶段 2 修复测试或切换到 `/dev` @.agent/workflows/dev.md 修复代码

// turbo
2. **运行所有单元测试（确保无回归）**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 所有测试必须通过
   - 如果单元测试失败 → 切换到 `/dev` @.agent/workflows/dev.md 流程修复

// turbo
3. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - 引用 `/dev` @.agent/workflows/dev.md 的质量门禁标准（针对每个文件）
   - ❌ 如果阈值未达标 → 切换到 `/dev` @.agent/workflows/dev.md 流程修复代码
   - ⚠️ **切记**：如果你在任何步骤中跳过了测试或忽略了警告，必须在最终报告中明确告知用户。

// turbo
4. **处理开发服务器**
   - **若为"复用模式"**（阶段 1 检测到已有服务器）→ 保持运行，不关闭
   - **若为"新启动模式"**（阶段 1 启动了新服务器）→ 关闭服务器

// turbo
5. **环境清理**
   ```bash
   npm run test:e2e:cleanup
   ```

✅ **只有阶段 3 所有检查通过后，任务才算完成。**

---

## 阶段 4：文档记录

1. 更新 `walkthrough.md`，包含：
   - 新增/修改的 E2E 测试摘要
   - 测试覆盖的用户流程
   - 执行的测试命令和结果
   - 如果修复了 Bug，记录修复内容

---

## 与 /dev 流程的协作

当 E2E 测试发现 Bug 或需要新功能时：

```
E2E 红色阶段 → 发现需要改代码
       ↓
 切换到 /dev @.agent/workflows/dev.md 流程
       ↓
 /dev @.agent/workflows/dev.md 阶段 1-4（完整 TDD 循环）
       ↓
 返回 E2E 流程
       ↓
E2E 绿色阶段 → 测试通过
```

**关键原则**：
- E2E 测试不应直接修改应用代码
- 代码修改必须通过 `/dev` @.agent/workflows/dev.md 流程，确保单元测试覆盖
- 这保证了测试金字塔的完整性

---

## 🏗️ 架构设计详解

### Page Object Model (POM) 设计原则

#### 1. 职责分离

每个 Page Object 应该只负责一个特定的 UI 区域或功能模块：

```typescript
// ✅ 好的例子 - 职责明确
export class PageListPage {
  constructor(private page: Page) {}
  
  async getPageCount(): Promise<number> {
    return await this.page.locator('.page-item').count();
  }
}

// ❌ 坏的例子 - 职责混乱
export class PageListPage {
  async getPageCount(): Promise<number> { /* ... */ }
  async triggerOCR(index: number) { /* OCR 应该在 OCRPage */ }
  async exportFile() { /* Export 应该在 ExportPage */ }
}
```

#### 2. 封装选择器

使用私有 getter 封装选择器，避免在多处重复：

```typescript
export class PageListPage {
  constructor(private page: Page) {}
  
  // ✅ 私有 getter
  private get pageItems() {
    return this.page.locator('.page-item');
  }
  
  private get selectAllCheckbox() {
    return this.page.getByTestId('select-all-checkbox');
  }
  
  // 公共方法使用 getter
  async selectAll() {
    await this.selectAllCheckbox.check();
  }
}
```

#### 3. 命名约定

**类名**: `XxxPage` (如 `PageListPage`)  
**文件名**: `XxxPage.ts`  
**放置位置**: `tests/e2e/pages/`

**方法命名**:
- 动作方法: 使用动词开头 (`click`, `select`, `upload`)
- 查询方法: 使用 `get` 或 `is` 开头 (`getPageCount`, `isVisible`)
- 等待方法: 使用 `waitFor` 开头 (`waitForPagesLoaded`)

```typescript
// ✅ 好的命名
async clickPage(index: number) { }
async getPageCount(): Promise<number> { }
async isPageSelected(index: number): Promise<boolean> { }
async waitForPagesLoaded() { }

// ❌ 坏的命名
async page(index: number) { }  // 不明确
async count() { }  // 不明确
async check(index: number) { }  // 不明确
```

#### 4. 返回值类型

- **动作方法**: 返回 `Promise<void>` 或不返回
- **查询方法**: 返回具体类型 (`Promise<number>`, `Promise<boolean>`)
- **等待方法**: 返回 `Promise<void>`

```typescript
// 动作方法
async selectAll(): Promise<void> {
  await this.selectAllCheckbox.check();
}

// 查询方法
async getPageCount(): Promise<number> {
  return await this.pageItems.count();
}

// 等待方法
async waitForPagesLoaded(): Promise<void> {
  await this.pageItems.first().waitFor({ state: 'visible' });
}
```

### Helper 函数开发

#### 何时创建 Helper

- 跨多个 Page Object 使用的逻辑
- 复杂的等待逻辑
- 通用的验证逻辑
- 数据转换和处理

#### Helper 函数示例

```typescript
// tests/e2e/helpers/wait-helpers.ts
import type { Page } from '@playwright/test';

/**
 * 等待页面达到指定状态
 * @param page Playwright Page 对象
 * @param pageIndex 页面索引
 * @param status 期望的状态（支持单个或多个）
 * @param timeout 超时时间（毫秒）
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
```

#### Helper 命名约定

- **文件名**: `xxx-helpers.ts` (如 `wait-helpers.ts`)
- **函数名**: 描述性动词短语 (如 `waitForPageStatus`)
- **放置位置**: `tests/e2e/helpers/`

### Mock 数据管理

#### APIMocks 使用指南

##### 基本用法

```typescript
import { APIMocks } from '../mocks/APIMocks';

test('should mock OCR API', async ({ page }) => {
  const apiMocks = new APIMocks(page);
  
  // 模拟成功响应
  await apiMocks.mockOCR();
  
  // 模拟延迟
  await apiMocks.mockOCR({ delay: 2000 });
  
  // 模拟失败
  await apiMocks.mockOCR({ shouldFail: true, statusCode: 500 });
});
```

##### 高级用法

```typescript
// 使用控制标志进行精确控制
test('should handle concurrent OCR', async ({ page }) => {
  const completeFlag = { value: false };
  
  await apiMocks.mockOCRWithControl(completeFlag);
  
  // ... 执行一些操作 ...
  
  // 允许 OCR 完成
  completeFlag.value = true;
});
```

#### TestData 管理

##### 文件路径

```typescript
import { TestData } from '../data/TestData';

// 单个文件
TestData.files.samplePDF()
TestData.files.samplePNG()

// 多个文件
TestData.files.multipleImages()
TestData.files.pdfAndImages()
```

##### 翻译文本

```typescript
// 英文
TestData.translations.en.emptyState
TestData.translations.en.importButton

// 中文
TestData.translations['zh-CN'].emptyState
TestData.translations['zh-CN'].importButton
```

##### 页面状态

```typescript
// 就绪状态
TestData.pageStatuses.ready

// OCR 完成状态
TestData.pageStatuses.ocrComplete

// 处理中状态
TestData.pageStatuses.processing
```

### 测试结构规范

```typescript
import { test, expect } from '../fixtures/base-test';
import { AppPage } from '../pages/AppPage';
import { PageListPage } from '../pages/PageListPage';

test.describe('Feature Name', () => {
  let app: AppPage;
  let pageList: PageListPage;

  test.beforeEach(async ({ page }) => {
    // 初始化 Page Objects
    app = new AppPage(page);
    pageList = new PageListPage(page);
    
    // 设置初始状态
    await app.goto();
    await app.waitForAppReady();
  });

  test('should do something specific', async ({ page }) => {
    // Arrange - 准备测试数据
    const filePath = TestData.files.samplePDF();
    
    // Act - 执行操作
    await pageList.uploadAndWaitReady([filePath]);
    
    // Assert - 验证结果
    expect(await pageList.getPageCount()).toBe(6);
  });
});
```

### 测试命名约定

- **使用 `should` 开头**: 描述期望行为
- **清晰简洁**: 一眼就能看出测试目的
- **包含关键信息**: 输入、操作、预期结果

```typescript
// ✅ 好的命名
test('should export Markdown when all pages ready', async ({ page }) => { })
test('should handle OCR failure gracefully', async ({ page }) => { })
test('should persist page order after reload', async ({ page }) => { })

// ❌ 坏的命名
test('test export markdown', async ({ page }) => { })
test('ocr', async ({ page }) => { })
test('page order', async ({ page }) => { })
```

### 测试独立性原则

每个测试应该完全独立，不依赖其他测试的状态：

```typescript
// ✅ 好的例子 - 每个测试自己准备数据
test.beforeEach(async ({ page }) => {
  app = new AppPage(page);
  await app.goto();
  await app.clearDatabase();  // 清理状态
});

test('test 1', async ({ page }) => {
  await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
  // ...
});

test('test 2', async ({ page }) => {
  await pageList.uploadAndWaitReady([TestData.files.samplePNG()]);
  // ...
});
```

---

## 🎯 最佳实践大全

### Locator 策略优先级

Playwright 推荐按以下优先级选择定位器，优先使用**面向用户**的定位器而非技术实现：

#### 优先级排序

1. ⭐⭐⭐⭐⭐ **`getByRole()`** - 最推荐，基于 ARIA 角色和可访问性
2. ⭐⭐⭐⭐ **`getByLabel()`** - 通过关联的 label 定位表单元素
3. ⭐⭐⭐⭐ **`getByPlaceholder()`** - 通过 placeholder 定位输入框
4. ⭐⭐⭐ **`getByText()`** - 通过可见文本定位
5. ⭐⭐ **`getByTestId()`** - 通过 data-testid 定位（当上述方法不适用时）
6. ⭐ **CSS/XPath** - 最后的选择，应尽量避免

#### 示例对比

```typescript
// ❌ 不推荐：依赖 CSS 类名（容易因样式变化而失效）
await page.locator('.submit-button').click();

// ⚠️ 可接受：使用 data-testid（但不是最佳）
await page.locator('[data-testid="submit-button"]').click();

// ✅ 推荐：使用 getByRole（最接近用户行为）
await page.getByRole('button', { name: 'Submit' }).click();

// ✅ 推荐：使用 getByLabel（表单元素）
await page.getByLabel('Username').fill('admin');

// ✅ 推荐：使用 getByText（可见文本）
await page.getByText('Import Files').click();
```

#### 为什么优先使用面向用户的定位器？

1. **可访问性**: 如果你的测试能用 `getByRole` 找到元素，说明屏幕阅读器也能找到
2. **稳定性**: 不依赖 CSS 类名或 DOM 结构，更能抵抗重构
3. **可读性**: 测试代码更接近用户的操作方式
4. **维护性**: 当 UI 改变时，基于语义的定位器更不容易失效

### 智能等待策略

#### 避免固定延迟

```typescript
// ❌ 不要使用固定延迟
await page.waitForTimeout(5000);

// ✅ 使用条件等待
await page.waitForFunction(() => {
  return window.pagesStore?.pages.length > 0;
});

// ✅ 使用 helper 函数
await waitForPageStatus(page, 0, 'ocr_success');

// ✅ 使用 Playwright 内置等待
await page.locator('.page-item').first().waitFor({ state: 'visible' });
```

#### 常见等待场景

**1. 等待元素出现**

```typescript
// 等待单个元素
await page.locator('.page-item').waitFor({ state: 'visible' });

// 等待多个元素
await page.waitForFunction((count) => {
  return document.querySelectorAll('.page-item').length === count;
}, expectedCount);
```

**2. 等待状态变化**

```typescript
// 等待 Store 状态
await page.waitForFunction(() => {
  const pages = window.pagesStore?.pages || [];
  return pages[0]?.status === 'ocr_success';
});

// 使用 helper
await waitForPageStatus(page, 0, 'ocr_success');
```

**3. 等待网络请求**

```typescript
// 等待特定请求完成
const responsePromise = page.waitForResponse(
  response => response.url().includes('/api/ocr') && response.status() === 200
);
await page.click('.trigger-ocr-btn');
await responsePromise;
```

### 测试隔离与环境标准

- **测试独立性**: 每个测试应独立运行，不依赖其他测试的状态
- **状态清理**: 使用 `beforeEach` 清理或重置状态
- **使用自定义 fixture**: **必须使用 `../fixtures/base-test`** 替代直接从 `@playwright/test` 导入
- **串行测试**: 对于具有严格先后顺序依赖的测试组，可以使用 `test.describe.serial`

### 全局质量门禁 (Console Monitoring)

本项目强制要求所有 E2E 测试保持浏览器控制台"清洁"。任何未处理的 `Error` 或 `Warning` 都会导致测试失败。

- **实现方式**：自动通过 `fixtures/base-test.ts` 实现
- **标准**：测试结束时，控制台日志累积量必须为 0
- **排除**：如果某些第三方警告无法修复且不影响功能，可在 `base-test.ts` 中配置白名单过滤

### 使用 test.step() 组织测试步骤

使用 `test.step()` 可以将复杂测试分解为有意义的步骤，提高可读性和调试效率：

```typescript
test('should complete full workflow', async ({ page }) => {
  await test.step('Setup: Upload files', async () => {
    await pageList.uploadAndWaitReady([
      TestData.files.samplePDF(),
      TestData.files.samplePNG()
    ]);
    expect(await pageList.getPageCount()).toBe(7);
  });

  await test.step('Process: Trigger OCR', async () => {
    await pageList.selectAll();
    await pageList.clickBatchOCR();
    await ocrPage.waitForAllOCRComplete();
  });

  await test.step('Verify: Export results', async () => {
    const download = await exportPage.exportAs('Markdown');
    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });
});
```

**优点**:
- 测试报告中显示每个步骤的执行状态
- 失败时能快速定位到具体步骤
- 提高测试代码的可读性

### Soft Assertions（软断言）

使用软断言允许测试在断言失败后继续执行，收集所有错误：

```typescript
test('should validate multiple properties', async ({ page }) => {
  // 使用 soft 断言
  await expect.soft(page.getByText('Title')).toBeVisible();
  await expect.soft(page.getByText('Description')).toBeVisible();
  await expect.soft(page.getByText('Author')).toBeVisible();
  
  // 即使前面的断言失败，这个也会执行
  await expect.soft(page.getByText('Date')).toBeVisible();
  
  // 最后统一报告所有失败
});
```

**使用场景**:
- 验证页面的多个元素
- UI 一致性检查
- 批量验证列表项

### Storage State（存储状态）

保存和复用认证状态，避免每个测试都重新登录，**可节省 50%+ 测试时间**：

```typescript
// auth.setup.ts - 设置认证
import { test as setup } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // 等待登录完成
  await page.waitForURL('/dashboard');
  
  // 保存认证状态
  await page.context().storageState({ path: 'auth.json' });
});

// 在测试中使用保存的状态
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'auth.json',
      },
      dependencies: ['setup'],
    },
  ],
});
```

### 视觉回归测试

使用 `toHaveScreenshot()` 进行视觉对比测试：

```typescript
test('should match visual snapshot', async ({ page }) => {
  await page.goto('/dashboard');
  
  // 第一次运行会生成基准截图
  // 后续运行会与基准对比
  await expect(page).toHaveScreenshot('dashboard.png', {
    // 忽略动态内容
    mask: [page.locator('.timestamp'), page.locator('.loading-spinner')],
    
    // 允许的最大差异像素数
    maxDiffPixels: 100,
    
    // 允许的最大差异比例
    maxDiffPixelRatio: 0.02,
  });
});
```

**最佳实践**:
- Mask 掉动态内容（时间戳、加载动画等）
- 设置合理的差异阈值
- 在 CI 中使用 `--update-snapshots` 更新基准

### 网络拦截和模拟

#### 修改请求

```typescript
test('should modify API request', async ({ page }) => {
  await page.route('**/api/ocr', async (route) => {
    const request = route.request();
    
    // 修改请求头
    await route.continue({
      headers: {
        ...request.headers(),
        'X-Custom-Header': 'test-value',
      },
    });
  });
  
  await page.goto('/');
});
```

#### 模拟不同的响应

```typescript
test('should handle various API responses', async ({ page }) => {
  // 模拟成功响应
  await page.route('**/api/ocr', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: '...' }),
    });
  });
  
  // 模拟延迟
  await page.route('**/api/slow', async (route) => {
    await page.waitForTimeout(3000);
    await route.continue();
  });
  
  // 模拟网络错误
  await page.route('**/api/error', async (route) => {
    await route.abort('failed');
  });
});
```

#### 等待特定请求

```typescript
test('should wait for API call', async ({ page }) => {
  // 方法 1: 等待响应
  const responsePromise = page.waitForResponse(
    response => response.url().includes('/api/ocr') && response.status() === 200
  );
  await page.click('.trigger-ocr-btn');
  const response = await responsePromise;
  const data = await response.json();
  
  // 方法 2: 等待请求
  const requestPromise = page.waitForRequest(
    request => request.url().includes('/api/ocr')
  );
  await page.click('.trigger-ocr-btn');
  await requestPromise;
});
```

### Test Fixtures 高级用法

创建自定义 fixtures 来设置测试环境：

```typescript
// fixtures/custom-test.ts
import { test as base } from '@playwright/test';
import { PageListPage } from '../pages/PageListPage';
import { OCRPage } from '../pages/OCRPage';

type MyFixtures = {
  pageList: PageListPage;
  ocrPage: OCRPage;
  authenticatedPage: Page;
};

export const test = base.extend<MyFixtures>({
  // 自动初始化的 Page Object
  pageList: async ({ page }, use) => {
    const pageList = new PageListPage(page);
    await use(pageList);
  },
  
  ocrPage: async ({ page }, use) => {
    const ocrPage = new OCRPage(page);
    await use(ocrPage);
  },
  
  // 已认证的页面
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'auth.json',
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

// 使用自定义 fixture
test('should use fixtures', async ({ pageList, ocrPage }) => {
  // pageList 和 ocrPage 已经初始化好了
  await pageList.uploadAndWaitReady([TestData.files.samplePDF()]);
  await ocrPage.triggerOCR(0);
});
```

### 并行和分片

#### 配置并行度（可减少 50-70% CI 执行时间）

```typescript
// playwright.config.ts
export default defineConfig({
  // 在文件级别并行
  fullyParallel: true,
  
  // Worker 数量
  workers: process.env.CI ? 2 : '50%',
  
  // 每个 worker 的最大失败次数
  maxFailures: process.env.CI ? 1 : 0,
});
```

#### 使用分片加速 CI

```typescript
// package.json
{
  "scripts": {
    "test:shard-1": "playwright test --shard=1/3",
    "test:shard-2": "playwright test --shard=2/3",
    "test:shard-3": "playwright test --shard=3/3"
  }
}
```

```yaml
# GitHub Actions
jobs:
  test:
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - run: npx playwright test --shard=${{ matrix.shard }}/3
```

#### 控制测试执行模式

```typescript
// 完全并行（默认）
test.describe.configure({ mode: 'parallel' });

// 串行执行
test.describe.configure({ mode: 'serial' });

test.describe('Serial tests', () => {
  test.describe.configure({ mode: 'serial' });
  
  test('runs first', async ({ page }) => { });
  test('runs second', async ({ page }) => { });
});
```

### 测试重试策略

```typescript
// playwright.config.ts - 全局配置
export default defineConfig({
  retries: process.env.CI ? 2 : 0,
});

// 单个测试配置
test('flaky test', async ({ page }) => {
  test.retries(3);  // 这个测试最多重试 3 次
  // ...
});

// 条件跳过
test('conditional test', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Not supported in WebKit');
  test.fixme(someCondition, 'Known issue, will fix later');
  test.slow(); // 将超时时间增加 3 倍
  // ...
});
```

### 测试标记和过滤

```typescript
// 添加标记
test('critical feature @smoke', async ({ page }) => { });
test('new feature @experimental', async ({ page }) => { });

// 运行特定标记的测试
// npm run test:e2e -- --grep @smoke
// npm run test:e2e -- --grep-invert @experimental  (排除)
```

---

## 🔍 调试和优化

### 调试技巧

#### 1. 使用 UI 模式（⭐⭐⭐⭐⭐ 推荐）

```bash
npm run test:e2e -- --ui
```

**优点**:
- 实时查看测试执行
- 可以暂停和单步执行
- 查看每一步的 DOM 状态
- 时间旅行调试

#### 2. 使用 Debug 模式

```typescript
test('should debug this', async ({ page }) => {
  await page.pause();  // 暂停执行，打开调试器
  // ...
});
```

```bash
# 命令行调试
npx playwright test --debug
```

#### 3. 添加调试日志

```typescript
test('should log for debugging', async ({ page }) => {
  const count = await pageList.getPageCount();
  console.log('Page count:', count);
  
  const status = await ocrPage.getPageStatus(0);
  console.log('Page status:', status);
});
```

#### 4. 截图调试

```typescript
test('should take screenshots', async ({ page }) => {
  await page.screenshot({ path: 'debug-1.png' });
  
  // 执行操作
  await pageList.uploadAndWaitReady([filePath]);
  
  await page.screenshot({ path: 'debug-2.png' });
});
```

#### 5. Trace 录制（10x 调试效率提升）

```typescript
test('should trace production issue', async ({ page, context }) => {
  // 开始录制 trace
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  
  try {
    // 执行测试步骤
    await page.goto('/');
    await page.click('.problematic-button');
  } finally {
    // 保存 trace
    await context.tracing.stop({
      path: 'trace.zip',
    });
  }
});

// 查看 trace: npx playwright show-trace trace.zip
```

### 性能优化

#### 1. 并行执行

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
});
```

#### 2. 合理使用 Mock

```typescript
// ✅ 使用 Mock 加速测试
await apiMocks.mockOCR();  // 立即返回结果

// ❌ 不必要的真实 API 调用
// 会导致测试变慢且不稳定
```

#### 3. 复用浏览器上下文

```typescript
// 对于独立的测试，可以复用浏览器实例
// Playwright 默认已优化，无需手动配置
```

#### 4. 优化文件上传

```typescript
// ✅ 使用小文件进行快速测试
TestData.files.samplePNG()  // 141 KB

// ❌ 避免在每个测试中都使用大文件
TestData.files.largePDF()  // 仅在必要时使用
```

### 常见问题和解决方案

#### 问题 1: 测试间歇性失败

**原因**: 使用了固定延迟或等待条件不够精确

**解决方案**:
```typescript
// ❌ 问题代码
await page.waitForTimeout(1000);

// ✅ 解决方案
await page.waitForFunction(() => {
  return document.querySelector('.target-element') !== null;
});
```

#### 问题 2: 拖拽操作不稳定

**原因**: 元素尚未完全渲染或动画未完成

**解决方案**:
```typescript
async dragAndDrop(fromIndex: number, toIndex: number) {
  const source = this.pageItems.nth(fromIndex);
  const target = this.pageItems.nth(toIndex);
  
  // 确保元素可见
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  
  // 执行拖拽
  await source.dragTo(target);
  
  // 等待数据库更新
  await this.waitForDatabaseUpdate();
}
```

#### 问题 3: 文件上传后页面未显示

**原因**: 未等待异步处理完成

**解决方案**:
```typescript
async uploadAndWaitReady(filePaths: string[]) {
  const beforeCount = await this.getPageCount();
  
  // 上传文件
  const [fileChooser] = await Promise.all([
    this.page.waitForEvent('filechooser'),
    this.page.click('.upload-btn')
  ]);
  await fileChooser.setFiles(filePaths);
  
  // 等待页面增加
  await this.page.waitForFunction((expected) => {
    return document.querySelectorAll('.page-item').length >= expected;
  }, beforeCount + filePaths.length);
  
  // 等待缩略图渲染
  await this.waitForThumbnailsReady();
}
```

---

## 📊 快速参考

### 常用命令速查表

| 场景 | 命令 | 用途 |
|------|------|------|
| 环境准备 | `npm run dev` | 启动开发服务器 |
| 聚焦测试 | `npx playwright test <file> --headed` | 可视化运行单个文件 |
| 调试模式 | `npx playwright test --debug` | 断点调试 |
| UI 模式 | `npm run test:e2e -- --ui` | 交互式测试开发 |
| 代码生成 | `npx playwright codegen http://localhost:5173` | 录制生成测试代码 |
| 完整测试 | `npm run test:e2e` | 运行所有 E2E 测试 |
| 测试报告 | `npx playwright show-report` | 查看 HTML 报告 |
| Trace 查看 | `npx playwright show-trace trace.zip` | 查看测试录制 |
| 环境清理 | `npm run test:e2e:cleanup` | 清理测试环境 |

### 选择器优先级速查

| 优先级 | 选择器 | 示例 | 推荐指数 |
|--------|--------|------|---------|
| 1 | `getByRole()` | `page.getByRole('button', { name: 'Submit' })` | ⭐⭐⭐⭐⭐ |
| 2 | `getByLabel()` | `page.getByLabel('Username')` | ⭐⭐⭐⭐ |
| 3 | `getByPlaceholder()` | `page.getByPlaceholder('Enter email')` | ⭐⭐⭐⭐ |
| 4 | `getByText()` | `page.getByText('Import Files')` | ⭐⭐⭐ |
| 5 | `getByTestId()` | `page.getByTestId('submit-btn')` | ⭐⭐ |
| 6 | CSS/XPath | `page.locator('.submit-button')` | ⭐ |

### 等待方法速查

| 场景 | 方法 | 示例 |
|------|------|------|
| 等待元素可见 | `waitFor()` | `await locator.waitFor({ state: 'visible' })` |
| 等待条件 | `waitForFunction()` | `await page.waitForFunction(() => ...)` |
| 等待响应 | `waitForResponse()` | `await page.waitForResponse(url => ...)` |
| 等待请求 | `waitForRequest()` | `await page.waitForRequest(url => ...)` |
| 等待导航 | `waitForURL()` | `await page.waitForURL('/dashboard')` |
| 等待选择器 | `waitForSelector()` | `await page.waitForSelector('.item')` |

---

## 📚 参考资源

- [Playwright 官方文档](https://playwright.dev)
- [Page Object Model 模式](https://playwright.dev/docs/pom)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
- [Locators 指南](https://playwright.dev/docs/locators)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [并行测试](https://playwright.dev/docs/test-parallel)

---

**最后更新**: 2026-01-08  
**维护者**: Scan2Doc Team
