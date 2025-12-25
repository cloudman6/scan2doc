---
description: E2E test development workflow using Playwright. Use this for creating or updating end-to-end tests.
---

这是 **E2E 测试开发**的专用流程。它遵循 TDD 风格，并在发现 Bug 时无缝切换到 `/dev` 流程进行修复。

## 前置条件
- 已确定要测试的用户流程或功能
- 需求已清晰理解（新测试、Bug 复现、或测试更新）
- **依赖**：确保 Playwright 已安装并配置（`playwright.config.ts`）

---

## 阶段 0：飞行前检查（必须通过）

> 引用 `/dev` workflow 的阶段 0，确保项目处于健康状态。

// turbo
1. **运行所有单元测试**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
2. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
3. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - ❌ 如果阈值未达标，**报告用户并询问**：是否需要先修复？

✅ **只有所有检查通过（或用户选择继续）后才能进入阶段 1。**

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
   - 使用 Playwright 的 `test` 和 `expect` API
   - 描述用户流程的每个步骤

2. **使用聚焦模式开发**
   ```bash
   npx playwright test tests/e2e/specs/<file>.spec.ts --headed
   ```
   - 使用 `--headed` 可视化调试
   - 使用 `test.only(...)` 聚焦单个测试

3. **确认测试因正确原因失败**
   - 如果是功能缺失 → 这是预期的红色状态
   - 如果是选择器问题 → 修复选择器

### 绿色阶段：让测试通过

**情况 A：测试通过（功能已存在）**
- 继续添加更多测试用例

**情况 B：需要修改应用代码**
- ⚠️ **切换到 `/dev` 流程**：
  1. 暂停 E2E 测试开发
  2. 按照 `/dev` 流程修复 Bug 或实现功能
  3. 确保单元测试覆盖
  4. 返回继续 E2E 测试

### 重构阶段：优化测试代码

1. **提取可复用的工具函数**
   - 常用操作封装到 `tests/e2e/utils/` 或 Page Object
   - 如：文件上传、页面导航

2. **优化选择器**
   - 优先使用 `data-testid` 属性
   - 避免脆弱的 CSS 选择器

3. **添加适当的等待和重试**
   - 使用 Playwright 的自动等待机制
   - 对于复杂异步操作，使用 `waitFor` 系列方法

---

## 阶段 3：验证

// turbo
1. **运行完整 E2E 测试套件**
   ```bash
   npm run test:e2e
   ```
   - ❌ 所有测试必须通过
   - 如果 E2E 测试失败 → 返回阶段 2 修复测试或切换到 `/dev` 修复代码

// turbo
2. **运行所有单元测试（确保无回归）**
   ```bash
   npm run test:unit -- --run
   ```
   - ❌ 所有测试必须通过
   - 如果单元测试失败 → 切换到 `/dev` 流程修复

// turbo
3. **验证覆盖率和复杂度**
   ```bash
   npm run test:unit -- --run --coverage
   npm run lint:complexity
   ```
   - 引用 `/dev` 的质量门禁标准
   - ❌ 如果阈值未达标 → 切换到 `/dev` 流程修复代码

// turbo
4. **处理开发服务器**
   - **若为"复用模式"**（阶段 1 检测到已有服务器）→ 保持运行，不关闭
   - **若为"新启动模式"**（阶段 1 启动了新服务器）→ 关闭服务器

✅ **只有阶段 3 所有检查通过后，任务才算完成。**

---

## 阶段 4：文档记录

1. 更新 `walkthrough.md`，包含：
   - 新增/修改的 E2E 测试摘要
   - 测试覆盖的用户流程
   - 执行的测试命令和结果
   - 如果修复了 Bug，记录修复内容

---

## E2E 测试最佳实践

### 选择器策略（优先级从高到低）
| 优先级 | 选择器类型 | 示例 |
|--------|-----------|------|
| 1 | `data-testid` | `[data-testid="submit-btn"]` |
| 2 | 语义化角色 | `getByRole('button', { name: 'Submit' })` |
| 3 | 文本内容 | `getByText('Submit')` |
| 4 | CSS 类（不推荐） | `.submit-button` |

### 等待策略
```typescript
// ✅ 推荐：使用自动等待
await page.click('[data-testid="upload-btn"]');
await expect(page.locator('[data-testid="file-list"]')).toBeVisible();

// ✅ 推荐：等待特定条件
await page.waitForSelector('[data-testid="processing-complete"]');

// ❌ 避免：固定时间等待
await page.waitForTimeout(3000); // 不推荐
```

### 文件上传测试
```typescript
// 使用 File Chooser 机制
const fileChooserPromise = page.waitForEvent('filechooser');
await page.click('[data-testid="upload-btn"]');
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles('path/to/test-file.pdf');
```

### 测试隔离
- 每个测试应独立运行，不依赖其他测试的状态
- 使用 `beforeEach` 清理或重置状态
- 考虑使用 `test.describe.serial` 处理有序依赖的测试组

### 调试技巧
```bash
# 可视化运行
npx playwright test --headed

# 单步调试
npx playwright test --debug

# 生成测试代码
npx playwright codegen http://localhost:5173

# 查看测试报告
npx playwright show-report
```

---

## 与 `/dev` 流程的协作

当 E2E 测试发现 Bug 或需要新功能时：

```
E2E 红色阶段 → 发现需要改代码
       ↓
 切换到 /dev 流程
       ↓
 /dev 阶段 1-4（完整 TDD 循环，跳过阶段 0 因为项目已健康）
       ↓
 返回 E2E 流程
       ↓
E2E 绿色阶段 → 测试通过
```

**关键原则**：
- E2E 测试不应直接修改应用代码
- 代码修改必须通过 `/dev` 流程，确保单元测试覆盖
- 这保证了测试金字塔的完整性

---

## 快速参考

| 阶段 | 命令 | 用途 |
|------|------|------|
| 环境准备 | `npm run dev` | 启动开发服务器 |
| 聚焦测试 | `npx playwright test <file> --headed` | 可视化运行单个文件 |
| 调试 | `npx playwright test --debug` | 断点调试 |
| 代码生成 | `npx playwright codegen <url>` | 录制生成测试代码 |
| 完整测试 | `npm run test:e2e` | 运行所有 E2E 测试 |
| 测试报告 | `npx playwright show-report` | 查看 HTML 报告 |