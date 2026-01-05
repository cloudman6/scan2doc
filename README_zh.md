# Scan2Doc

一个纯前端、仅限浏览器的文档处理工具，可利用 OCR 将扫描图像和多页 PDF 转换为 Markdown, DOCX, PDF等多种可编辑格式。

## 🚀 概览

Scan2Doc 旨在完全在浏览器内处理文档转换任务。通过利用 Web Workers 和 IndexedDB 等现代 Web 技术，它提供了一个功能强大、注重隐私的替代方案，取代了服务器端文档处理。

- **仅限前端**：无需后端服务（可选的第三方 OCR API 除外）。
- **隐私至上**：文档处理过程中绝不会离开您的浏览器。
- **支持大文档**：通过虚拟列表和高效的内存管理，针对数百页文档进行了优化。
- **状态持久化**：利用 IndexedDB，任务进度和中间结果在页面刷新后依然存在。

## 🛠️ 技术栈

- **框架**: Vue 3 (Composition API)
- **语言**: TypeScript
- **UI 库**: Naive UI
- **状态管理**: Pinia
- **数据库**: Dexie.js (IndexedDB)
- **PDF 核心**: `pdfjs-dist` (渲染) & `pdf-lib` (生成)
- **转换器**: `markdown-it` (Markdown) & `docx` (Word)
- **构建工具**: Vite
- **测试**: Vitest & Playwright

## ✨ 关键特性

- **PDF 转图像**：使用 Web Workers 高性能地将 PDF 页面转换为图像。
- **OCR 集成**：集成第三方 OCR API 进行文本识别。
- **多格式导出**：
  - Markdown
  - DOCX (Microsoft Word)
  - 文本+图像 PDF (可检索 PDF)
- **任务管理**：支持可恢复和可取消的长时间运行任务，具有实时进度报告。
- **以页面为中心的设计**：独立的页面管理，具有独立的状态和日志。

## 📦 快速入门

### 前置条件

- Node.js (推荐最新的 LTS 版本)
- npm 或 pnpm

### 安装

```bash
npm install
```

### 开发环境

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 测试

```bash
# 运行单元测试
npm run test:unit

# 使用 Vitest UI 运行界面测试
npm run test:ui
```

## 🏗️ 架构原则

- **状态驱动 UI**：UI 准确反映底层的属性状态。
- **明确的任务状态**：清晰的生命周期管理（空闲 / 处理中 / 成功 / 错误）。
- **响应式 UI**：将繁重的计算任务委派给 Web Workers，以保持主线程流速。
- **可观测性**：使用 `consola` 进行集中日志记录，便于调试和监控。

## 📄 许可证

本项目采用 MIT 许可证。
