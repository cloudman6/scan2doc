# PDF → Image Pipeline Architecture (Browser-only)

## 0. Goal

Build a **pure frontend, resumable, scalable** pipeline that converts a **large scanned PDF (hundreds of pages)** into **page-level images**.

This pipeline is the foundation for OCR and document generation.

Core technologies:
- p-queue (task scheduling)
- Web Worker (CPU-heavy PDF rendering)
- mitt (event bus)
- IndexedDB / Dexie (persistence & recovery)

---

## 1. Core Constraints

1. **Browser only**
   - Vue 3 + Vite
   - No backend
   - No Node.js APIs

2. **Scalability**
   - PDFs may contain hundreds of pages
   - Must not block the main thread
   - Must not render all pages at once

3. **Resumability**
   - Refreshing the browser must not lose progress
   - Completed pages must not re-render

4. **Responsiveness**
   - UI must remain interactive
   - Rendering must be incremental

---

## 2. High-level Architecture

```
User uploads PDF
        ↓
Load PDF metadata (page count)
        ↓
Create Page records in IndexedDB
        ↓
For each page:
   enqueue "render page → image" task
        ↓
p-queue schedules tasks (limited concurrency)
        ↓
Each task:
   → send render request to Web Worker
   → receive image data (base64)
   → persist to IndexedDB
   → emit progress/log events via mitt
```

---

## 3. Responsibilities by Component

### 3.1 p-queue — Task Scheduler

**Role**
- Controls how many pages are rendered concurrently

**Why**
- Prevent CPU / memory overload
- Avoid browser freezes

**Rules**
- One queue for PDF → Image
- Small concurrency (1–2)
- Queue state is NOT persisted

---

### 3.2 Web Worker — PDF Rendering Engine

**Role**
- Convert a single PDF page into an image base64 string

**Why**
- pdf.js rendering is CPU-intensive
- Must not block UI thread

**Rules**
- No IndexedDB access
- No Vue / Pinia imports
- Stateless
- Input: PDF data + pageId
- Output: image base64 string

---

### 3.3 mitt — Event Bus

**Role**
- Decoupled communication between queue, store, and UI

**Why**
- Avoid tight coupling
- Allow flexible UI reactions

**Rules**
- No business logic in listeners
- Events are fire-and-forget
- State changes still go through stores

---

## 4. Data Model (IndexedDB)

### Page Record

```ts
DBPage {
  id: string

  imageData?: string  // base64 image data

  status:
    | 'idle'
    | 'queued'
    | 'rendering'
    | 'done'
    | 'error'

  logs: Array<{
    time: number
    message: string
  }>
}
```

**Rule**
> IndexedDB is the single source of truth.

---

## 5. Processing Rules

### 5.1 Idempotency

Before enqueuing:
- If `status === 'done'` → skip
- If `imageData exists` → skip

Ensures safe resume after refresh.

---

### 5.2 Recovery on Refresh

On app startup:
1. Load pages from IndexedDB
2. Reset pages with `imageStatus === 'rendering'` to `idle`
3. Rebuild queue from idle pages

---

## 6. p-queue Design

### Initialization

```ts
import PQueue from 'p-queue'

export const pdfRenderQueue = new PQueue({
  concurrency: 2
})
```

### Enqueue Logic

```ts
for (const page of pages) {
  if (page.imageStatus === 'idle') {
    enqueueRenderPage(page)
  }
}
```

### Task Wrapper Responsibilities

Each task must:
1. Mark page as `rendering`
2. Emit log event
3. Call Web Worker
4. Persist imageData as base64
5. Mark page as `done`
6. Emit completion event
7. Handle errors → `error`

---

## 7. Web Worker Design

### Input

```ts
{
  pdfData: ArrayBuffer
  pageId: string
}
```

### Output

```ts
{
  pageId: string
  imageData: string  // base64 image data
}
```

### Worker Steps
1. Load pdf.js
```
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
```
2. Load PDF document
3. Render page to canvas
4. Convert canvas to base64 string
5. postMessage result

**Worker must NOT**
- Write to IndexedDB
- Manage state
- Emit UI events

---

## 8. mitt Event Definitions

```ts
type Events = {
  'pdf:page:queued': { pageId: string }
  'pdf:page:rendering': { pageId: string }
  'pdf:page:done': { pageId: string }
  'pdf:page:error': { pageId: string; error: string }
  'pdf:progress': { done: number; total: number }
  'pdf:log': { pageId: string; message: string }
}
```

---

## 9. File Structure

```
src/
├─ services/
│  └─ pdf/
│     ├─ pdfQueue.ts
│     ├─ pdfRenderer.ts
│     └─ events.ts
├─ workers/
│  └─ pdfRender.worker.ts
├─ stores/
│  └─ pages.ts
├─ db/
│  └─ index.ts
```

---

## 10. Implementation Order

1. Dexie schema
2. mitt event bus
3. Web Worker
4. p-queue wrapper
5. Render task logic
6. Recovery logic

---

## 11. Definition of Done

- Handles 300+ page PDFs
- UI remains responsive
- Progress persists across refresh
- No page rendered twice

---

## 12. Philosophy

This is not a batch job.
It is a **long-lived, fault-tolerant browser pipeline**.

Favor:
- Explicit state
- Clear boundaries
- Predictable behavior

Avoid:
- Hidden side effects
- Implicit concurrency
