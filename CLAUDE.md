# Project: Browser-only Image/PDF OCR & Converter

## Overview
This is a **pure frontend, browser-only** document processing tool.
No backend services are allowed except **third-party OCR APIs**.

The tool converts scanned images/multi-page PDFs into:
- Markdown
- HTML
- DOCX
- Text+Image PDF

All processing except OCR API calls must run **entirely in the browser**.

---

## Core Constraints (VERY IMPORTANT)

1. **Frontend only**
   - Vue 3 + Vite
   - No Node.js backend
   - No server-side rendering
   - No database except browser storage

2. **Persistence**
   - Use IndexedDB (via Dexie.js)
   - All intermediate results must survive page refreshes
   - Support resume / recovery

3. **Large documents**
   - PDFs may have hundreds of pages
   - Use virtual lists
   - Avoid loading all images into memory at once

4. **Long-running tasks**
   - OCR may take hours
   - UI must always remain responsive
   - Tasks must be resumable

---

## Technology Stack

- Framework: Vue 3 (Composition API)
- Bundler: Vite
- UI Library: Naive UI
- State Management: Pinia
- Local Storage: Dexie.js
- PDF Rendering: pdfjs-dist
- PDF Generation: pdf-lib
- Markdown: markdown-it
- DOCX: docx
- Drag & Drop: vue-draggable-next
- Virtual List: vue-virtual-scroller
- Task Queue: p-queue
- Utilities: @vueuse/core

---

## Architecture Principles

1. **Page-centric design**
   - Each image/PDF page is an independent unit
   - Each page has its own status, logs, and outputs

2. **State-driven UI**
   - UI reflects state
   - Avoid DOM-driven logic

3. **Explicit task states**
   - idle / processing / success / error
   - Never implicit or hidden states

4. **Readable, maintainable code**
   - Prefer clarity over cleverness
   - Avoid premature optimization

---

## Folder Structure (Target)

src/
├─ main.ts
├─ App.vue
├─ stores/
│  └─ pages.ts
├─ db/
│  └─ index.ts
├─ components/
│  ├─ page-list/
│  ├─ page-viewer/
│  ├─ preview/
│  └─ ...
├─ services/
│  ├─ add/
│  ├─ pdf/
│  ├─ ocr/
│  ├─ export/
│  └─ ...
├─ workers/
│  └─ pdf.worker.ts
└─ types/

---

## Coding Rules

- Use TypeScript
- Use `<script setup>`
- Use Composition API only
- Prefer async/await
- All side effects must be explicit
- Every long-running operation must:
  - report progress
  - be cancellable if possible
  - log status updates

---

## UI Component Guidelines

- **Use existing UI components and avoid reinventing the wheel**
- Use Naive UI components whenever possible for common UI patterns
- Leverage existing Naive UI message/notification system instead of custom implementations
- Only create custom components when Naive UI doesn't provide the needed functionality

---

## Testing Requirements

- **Always use Playwright MCP server to verify code functionality after making changes**
- If a service is already running on http://localhost:5173/, use it directly instead of starting a new one
- Use Playwright MCP server for debugging and testing new features
- Test thoroughly to ensure all functionality works as expected

---

## What Claude Should Do

- Generate production-quality code
- Explain complex logic briefly
- Propose improvements when relevant
- Ask clarification only when absolutely necessary

---

## What Claude Should NOT Do

- Do NOT introduce backend services
- Do NOT assume server APIs except OCR
- Do NOT use deprecated Vue APIs
- Do NOT use frameworks outside this stack