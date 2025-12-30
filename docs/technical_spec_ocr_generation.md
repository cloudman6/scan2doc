# 文档生成功能技术规格说明书 (Technical Specification) v2

## 1. 概述 (Overview)
本文档概述了在浏览器端将 OCR 结果（来自 DeepSeek API）转换为可编辑文档格式的架构设计。
**核心变更点（基于反馈）**:
- 采用更扁平、统一的数据库表命名 (`pageOCRs`, `pageMarkdowns` 等)。
- 明确了图片嵌入和中间格式的转换策略。

## 2. 数据库模型设计 (Database Schema Design)
遵循 `pageImages` 的命名风格，采用**每种资源独立分表**的策略。这能最大程度保证类型安全和查询性能（IndexedDB 对小表查询更快）。

### 2.1 `pageOCRs` 表
存储 OCR 原始响应数据 (JSON)。
```typescript
interface PageOCR {
  pageId: string; // 主键
  data: OCRResult; // 完整 JSON
  // createdAt 虽非必须（可从 pages 表获取），但保留作为数据版本的标记是有益的
  createdAt: Date; 
}
```

### 2.2 文档资源表 (独立分表)
将不同格式的生成结果存放在独立表中，便于管理和扩展。

*   **`pageMarkdowns`**: 存储生成的 Markdown 文本。
    ```typescript
    interface PageMarkdown {
      pageId: string;
      content: string; // Markdown 字符串
    }
    ```

*   **`pagePDFs`**: 存储生成的双层 PDF (Blob)。
    ```typescript
    interface PagePDF {
      pageId: string;
      content: Blob | ArrayBuffer;
    }
    ```
*   **`pageDOCXs`**: 存储生成的 Word 文档 (Blob)。
    ```typescript
    interface PageDOCX {
      pageId: string;
      content: Blob | ArrayBuffer;
    }
    ```

### 2.3 `pageExtractedImages` 表 (新增)
用于存储从原扫描图中裁剪出来的插图。
*   **原因**: 不要将图片 base64 直接嵌入 Markdown 字符串存储，这会导致数据库读写性能急剧下降且浪费空间。
*   **策略**: 切图后存入此表，Markdown 中引用 `blob:url` (运行时生成) 或自定义协议链接。
```typescript
interface PageExtractedImage {
  id: string; // imageId (如: pageId_imgIndex)
  pageId: string;
  blob: Blob | ArrayBuffer;
  box: [number, number, number, number]; // 原始坐标
}
```

## 3. 转换策略与数据流 (Conversion Strategy)

### 3.1 核心链：OCR -> Markdown (Text)
*   **数据源**: `pageOCRs` (使用 `data.text` 字段).
*   **优势**: `data.text` 已经包含高质量的 Markdown 结构（标题、段落、表格）。
*   **补充处理**:
    1.  提取内容中的 `image` 标记（如果 API 返回）或通过 `data.boxes` 定位图片区域。
    2.  从原图裁剪图片，存入 `pageExtractedImages`。
    3.  在 Markdown 中插入图片占位符。



### 3.3 DOCX 生成 (Markdown -> DOCX)
*   **路径**: Markdown -> AST -> DOCX
*   **工具**: `docx` 库 + 自定义 Markdown 解析器
*   **理由**: 直接从 Markdown AST 转换能生成更原生的 Word 格式（如真正的 Word 表格对象），避免了中间格式转换的样式丢失。

### 3.4 可搜索 PDF (Raw Text -> PDF)
*   **数据源**: 原图 (`pageImages`) + `data.raw_text` (坐标信息)
*   **路径**: **Image + Raw Text Layer = Sandwich PDF**
*   **理由**: 
    *   纯文本生成的 PDF 通常只是重排文字，**会丢失原始扫描件的外观**。
    *   我们的目标通常是保留扫描件的原貌（公章、手写痕迹），同时通过 OCR 使得文字可被搜索/复制。这必须通过在原图上覆盖透明文字层来实现，`raw_text` 提供了精确的坐标。

## 4. 队列与事件架构 (Queue & Event Architecture)

为解决耗时操作、高并发和解耦问题，设计双层队列 + 事件总线 (Event Bus) 架构。

### 4.1 双层任务队列 (Dual Queues)
使用 `p-queue` (已项目引入) 进行并发控制。

1.  **`ocrQueue`**: 负责网络 I/O。
    *   **并发数**: 2 (避免触发 API 速率限制)。
    *   **任务**: 上传图片 -> 轮询/等待 -> 获取 JSON -> 写入 `pageOCRs`。
2.  **`generationQueue`**: 负责 CPU 密集型转换。
    *   **并发数**: 1 (避免浏览器主线程卡顿)。
    *   **任务**: 读 JSON -> 切图 -> 生成 Markdown/PDF -> 写入资源表。

### 4.2 事件驱动解耦 (Event Bus)
扩展现有的 `mitt` 事件系统，新增 `OCREvents`。各模块通过监听事件进行联动，不直接相互调用。

```typescript
type OCREvents = {
  // OCR 阶段
  'ocr:queued': { pageId: string };
  'ocr:start': { pageId: string };
  'ocr:success': { pageId: string; result: OCRResult }; // UI收到此事件更新状态，或触发后续转换
  'ocr:error': { pageId: string; error: Error };
  
  // 文档生成阶段
  'doc:gen:start': { pageId: string; type: 'markdown' | 'pdf' | ... };
  'doc:gen:success': { pageId: string; type: string; url: string };
  'doc:gen:error': { pageId: string; type: string; error: Error };
}
```

### 4.3 联动流程 (Workflow)
1.  **用户**点击 "Scan" -> **UI** 调用 `ocrQueue.add(pageId)`。
2.  **OCR Service** 完成任务 -> 存库 -> 发射 `ocr:success`。
3.  **Document Service** (作为监听者) 监听到 `ocr:success` -> 自动通过 `generationQueue.add()` 调度生成任务 (如配置了自动生成)。
4.  **UI** 监听 `ocr:start`/`doc:gen:start` 显示进度/Loading 状态。

### 4.4 队列管理与取消机制 (Queue Management & Cancellation)
**责任归属**: 创建一个统一的 `QueueManager` 单例服务（`src/services/queue/index.ts`），而不是让 OCRService 或 DocumentService 各自为政。

**功能**:
1.  **持有队列**: 内部维护 `ocrQueue` 和 `generationQueue` 实例。
2.  **任务追踪**: 维护 `Map<pageId, AbortController>`，用于追踪正在运行或排队的任务。
3.  **取消 API**: 提供 `cancel(pageId)` 方法。
    *   **排队中**: 通过检查标志位，在任务真正执行前拦截并放弃。
    *   **运行中**: 调用 `AbortController.abort()`，中断 fetch 请求或 Worker 任务。

**代码示意**:
```typescript
class QueueManager {
  private controllers = new Map<string, AbortController>();

  async addOCRTask(pageId: string, taskFn: (signal: AbortSignal) => Promise<void>) {
    const controller = new AbortController();
    this.controllers.set(pageId, controller);
    
    this.ocrQueue.add(async () => {
      if (controller.signal.aborted) return; // 排队期间被取消
      try {
        await taskFn(controller.signal);
      } finally {
        this.controllers.delete(pageId);
      }
    });
  }

  cancel(pageId: string) {
    const controller = this.controllers.get(pageId);
    if (controller) {
      controller.abort();
      this.controllers.delete(pageId);
    }
  }
}
```

## 5. 实施路线图 (Implementation Roadmap)

### 第一阶段：数据层升级
1.  **Schema 变更**: 在 `Scan2DocDB` 中注册 `pageOCRs`, `pageMarkdowns`, `pagePDFs`, `pageDOCXs`, `pageExtractedImages` 表。
2.  **Repo 层**: 封装对应的 `save/get` 方法。

### 第二阶段：队列与事件总线(Queue & Event Infrastructure)
1.  **EventBus**: 定义并实现 `OCREvents`。
2.  **QueueManager**: 实现 `src/services/queue`，封装双层队列和取消逻辑。
3.  **集成**: 将 `OCRService` 的直接 API 调用改为由 `QueueManager` 调度。

### 第三阶段：Markdown 引擎与切图
1.  **ImageProcessor**: 基于 Box 坐标从原图 Blob 切割子图。
2.  **MarkdownAssembler**: 组合 `ocr.text` 和切割后的图片。
3.  **UI集成**: 对接 `QueueManager`，监听事件更新 UI 状态。

### 第四阶段：文档导出器

2.  实现 `DocxGenerator`。
3.  UI: 在预览区增加 "Export" 功能。

### 第五阶段：双层 PDF 引擎
1.  实现 `SandwichPDFBuilder`：基于 `pdf-lib`，解析 `raw_text` 坐标，合成最终 PDF。
