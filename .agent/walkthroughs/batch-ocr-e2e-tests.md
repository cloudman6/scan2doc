# 批量OCR功能 - E2E测试开发 - Walkthrough

## 概述

为批量OCR功能开发了3个E2E测试用例，验证核心用户流程和智能跳过逻辑。

## 实现日期

2025-01-06

## 测试用例

### 用例1：基础批量OCR（Happy Path）
**文件：** `tests/e2e/specs/batch-ocr.spec.ts`

**测试场景：**
- 上传6页PDF文件
- 全选所有页面
- 点击批量OCR按钮
- 验证成功消息显示
- 验证所有页面完成OCR
- 验证页面刷新后状态持久化

**关键验证点：**
- 成功消息：`已将 6 个页面添加到 OCR 队列`
- 页面状态达到或超过 `ocr_success`
- 刷新后状态不回退到 `ready`

### 用例2：智能跳过逻辑
**测试场景：**
- 上传PDF并完成OCR（状态进入后续阶段）
- 上传新文件（PNG，单页，`ready` 状态）
- 全选所有页面
- 点击批量OCR
- 验证只有新页面被添加到队列

**关键验证点：**
- 成功消息包含跳过信息：`已将 1 个页面添加到 OCR 队列 (跳过 X 个已处理)`
- 已完成的页面状态不变
- 新页面完成OCR

### 用例3：边界情况 - 全部跳过
**测试场景：**
- 完成所有页面的OCR
- 再次点击批量OCR
- 验证警告消息显示

**关键验证点：**
- 警告消息：`选中的页面都已处理或正在处理中`

## 代码变更

### 1. 添加 data-testid 属性

**文件：** `src/components/page-list/PageList.vue`

**变更：**
```vue
<!-- 添加测试ID -->
<div data-testid="selection-toolbar">
  <NCheckbox data-testid="select-all-checkbox" />
  <NButton data-testid="batch-ocr-button" />
  <NButton data-testid="batch-delete-button" />
</div>
```

### 2. 扩展跳过状态列表

**文件：** `src/services/ocr/index.ts`

**变更原因：** OCR完成后，页面会进入文档生成阶段，状态变为 `markdown_success`、`pdf_success` 或 `completed` 等。

**新跳过状态：**
```typescript
const skipStatuses = [
  'pending_ocr',      // 已排队
  'recognizing',      // 正在处理OCR
  'ocr_success',      // OCR完成
  'pending_render',   // 渲染中
  'rendering',        // 渲染中
  'pending_gen',      // 等待生成（OCR已完成）
  'generating_markdown', // 生成Markdown（OCR已完成）
  'markdown_success', // Markdown已生成（OCR已完成）
  'generating_pdf',   // 生成PDF（OCR已完成）
  'pdf_success',      // PDF已生成（OCR已完成）
  'generating_docx',  // 生成DOCX（OCR已完成）
  'completed'         // 全部完成
]
```

### 3. 更新单元测试

**文件：** `src/services/ocr/index.test.ts`

**变更：** 更新测试用例以反映扩展的跳过状态列表

### 4. 创建E2E测试文件

**文件：** `tests/e2e/specs/batch-ocr.spec.ts`

**测试结构：**
```typescript
import { test, expect } from '../fixtures/base-test';
import { getPdfPageCount } from '../utils/pdf-utils';

test.describe('Batch OCR', () => {
  test.describe('Basic Batch OCR', () => { ... });
  test.describe('Smart Skip Logic', () => { ... });
  test.describe('Edge Cases', () => { ... });
});
```

## 测试策略

### 状态检查方法

使用 `page.waitForFunction()` 直接检查 `window.pagesStore.pages` 状态：

```typescript
await page.waitForFunction((idx) => {
  const pages = window.pagesStore?.pages || [];
  const status = pages[idx]?.status;
  return ['ocr_success', 'pending_gen', 'generating_markdown', ...].includes(status);
}, i, { timeout: 30000 });
```

**优点：**
- 直接访问内部状态，避免UI文本依赖
- 精确验证状态转换
- 支持复杂的状态集合检查

### 消息验证方法

由于 Naive UI 的消息会累积，使用 `page.evaluate()` 在DOM中搜索：

```typescript
const foundWarning = await page.evaluate(() => {
  const messages = document.querySelectorAll('.n-message');
  for (const msg of messages) {
    if (msg.textContent?.includes('预期文本')) {
      return true;
    }
  }
  return false;
});
```

## 验证结果

### 单元测试
- **总测试数：** 537个
- **通过率：** 100%
- **新增测试：** 0个（仅更新现有测试）

### E2E测试
- **批量OCR测试：** 3个（全部通过）
- **回归测试：** 136个通过
- **浏览器支持：** Chromium ✅

### 代码质量
- **复杂度检查：** 通过
- **ESLint：** 无错误

## 测试命令

```bash
# 单元测试
npm run test:unit -- --run

# E2E测试
npm run test:e2e

# 聚焦批量OCR测试
npx playwright test tests/e2e/specs/batch-ocr.spec.ts --project=chromium

# 代码质量
npm run lint:complexity
```

## 经验总结

### 关键学习点

1. **状态演进理解**
   - OCR完成后页面会继续进入文档生成阶段
   - 不能只检查 `ocr_success` 状态，需要检查所有"已完成OCR"的状态

2. **测试隔离**
   - E2E测试中消息会累积，需要小心选择正确的消息
   - 使用 `page.evaluate()` 在DOM中搜索比 `.first()` 更可靠

3. **复杂度控制**
   - 提取辅助函数减少嵌套层级
   - 简化边界情况测试的验证逻辑

### 改进建议

1. **消息清理：** 考虑在测试间添加消息清理逻辑
2. **浏览器兼容性：** Firefox/WebKit需要额外调试
3. **状态等待：** 可以添加更智能的状态等待辅助函数
