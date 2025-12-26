---
description: Pipeline for validating quality gates before committing and pushing code to Git.
---

这是用于在提交和推送代码到 Git 之前执行质量验证的工作流。

## 前置条件
- 已完成代码开发、测试和验证
- 已安装并配置 Git 环境

---

## 阶段 0：质量门禁（必须通过）

> 引用 `/dev` workflow 的阶段 0，确保项目处于健康状态。

// turbo
1. **运行所有单元测试**
   ```bash
   npm run test:unit
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？用户可以选择是（开始修复流程）或否（继续，不推荐）。

// turbo
2. **运行所有 E2E 测试**
   ```bash
   npm run test:e2e
   ```
   - ❌ 如果测试失败，**报告用户并询问**：是否需要先修复？

// turbo
3. **验证覆盖率阈值**
   ```bash
   npm run test:unit -- --coverage
   ```
   - **质量门禁标准**：
     - 行覆盖率：>= 90%
     - 分支覆盖率：>= 70%
     - 函数覆盖率：>= 80%
   - ❌ 如果覆盖率未达标，**报告用户并询问**：是否需要补充测试？

// turbo
4. **验证代码质量（复杂度 + Lint）**
   ```bash
   npm run lint:complexity
   ```
   - **复杂度阈值**：
     - 圈复杂度：<= 10
     - 认知复杂度：<= 15
   - **Lint 检查**：所有 warning 和 error 必须解决
   - ❌ 如果有复杂度超标、warning 或 error，**报告用户并询问**：是否需要修复？

✅ **只有所有检查通过（或用户选择继续）后才能进入阶段 1。**

### 阶段 0 问题修复流程

如果用户选择"修复"阶段 0 发现的问题：

1. **暂停当前提交任务**：将其标记为待恢复状态。
2. **启动新的 `/dev` 任务**：
   - 目标是修复阶段 0 中失败的特定项目（如修复测试、降低复杂度或补充覆盖率）。
   - 跳过该修复任务的阶段 0 检查，直接进入阶段 1-4。
   - 必须遵循完整的 TDD 循环。
3. **修复完成后**：
   - 返回 `/commit` 任务。
   - 重新执行阶段 0 的全部检查以确保修复彻底且未引入新问题。
   - 只有重新验证通过后，才允许进入阶段 1 进行提交。

---

## 阶段 1：Git 状态检查

// turbo
1. **检查暂存区内容**
   - 运行 `git status`
   - 确认是否有文件已暂存（Staged）
   - ❌ 如果暂存区为空，提醒用户执行 `git add`
   - 列出所有未跟踪的文件，询问用户是否需要包含在内

2. **验证当前分支**
   - 虽然允许直接提交到 `main` 或 `master`，但仍需向用户展示当前所在分支名

---

## 阶段 2：同步远程更改

// turbo
1. **拉取远程代码**
   ```bash
   git pull origin <current-branch>
   ```
   - ❌ 如果出现冲突，**停止并报告用户**，要求手动解决冲突后再继续此流程。

---

## 阶段 3：Commit Message 规范

1. **生成 Commit信息**
   - 遵循 **Conventional Commits** 规范。
   - 格式：`<type>(<scope>): <subject>`
   - 常用类型：
     - `feat`: 新功能
     - `fix`: 修复 Bug
     - `docs`: 文档改动
     - `style`: 代码格式改动
     - `refactor`: 重构
     - `test`: 增加测试
     - `chore`: 构建流程、辅助工具变动
   - 示例：`feat(ocr): 添加百度 OCR API 支持`

---

## 阶段 4：执行提交与推送

// turbo
1. **执行提交**
   ```bash
   git commit -m "<message>"
   ```

// turbo
2. **执行推送**
   ```bash
   git push origin <current-branch>
   ```

---

## 阶段 5：最终确认

// turbo
1. **确认推送成功**
   - 运行 `git status` 确认没有待提交或待推送的内容
   - 报告任务已成功同步到远程仓库

---

## 快速参考

| 阶段 | 命令 | 用途 |
|------|------|------|
| 质量检查 | `npm run test:unit` | 验证单元测试 |
| 覆盖率检查 | `npm run test:unit -- --coverage` | 验证覆盖率门禁 |
| 复杂度检查 | `npm run lint:complexity` | 验证代码质量门禁 |
| 同步代码 | `git pull origin <branch>` | 防止推送冲突 |
| 提交推送 | `git commit && git push` | 同步到远程仓库 |
