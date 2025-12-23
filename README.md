# Scan2Doc

A pure frontend, browser-only document processing tool that converts scanned images and multi-page PDFs into various editable formats using OCR.

## 🚀 Overview

Scan2Doc is designed to handle document conversion tasks entirely within the browser. By leveraging modern web technologies like Web Workers and IndexedDB, it provides a powerful, privacy-focused alternative to server-side document processing.

- **Frontend Only**: No backend services required (except for optional third-party OCR APIs).
- **Privacy First**: Documents never leave your browser for processing.
- **Large Document Support**: Optimized for hundreds of pages using virtual lists and efficient memory management.
- **Persistent State**: Progress and intermediate results survive page refreshes using IndexedDB.

## 🛠️ Technology Stack

- **Framework**: Vue 3 (Composition API)
- **Language**: TypeScript
- **UI Library**: Naive UI
- **State Management**: Pinia
- **Database**: Dexie.js (IndexedDB)
- **PDF Core**: `pdfjs-dist` (Rendering) & `pdf-lib` (Generation)
- **Converters**: `markdown-it` (Markdown) & `docx` (Word)
- **Build Tool**: Vite
- **Testing**: Vitest & Playwright

## ✨ Key Features

- **PDF to Image**: High-performance conversion of PDF pages to images using Web Workers.
- **OCR Integration**: Integration with third-party OCR APIs for text recognition.
- **Multi-Format Export**:
  - Markdown
  - HTML
  - DOCX (Microsoft Word)
  - Text+Image PDF (Searchable PDF)
- **Task Management**: Resumable and cancellable long-running tasks with real-time progress reporting.
- **Page-Centric Design**: Individual page management with independent status and logs.

## 📦 Getting Started

### Prerequisites

- Node.js (Latest LTS recommended)
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Testing

```bash
# Run unit tests
npm run test:unit

# Run UI tests with Vitest UI
npm run test:ui
```

## 🏗️ Architecture Principles

- **State-Driven UI**: UI accurately reflects the underlying data state.
- **Explicit Task States**: Clear lifecycle management (idle / processing / success / error).
- **Responsive UI**: Offloading heavy computations to Web Workers to keep the main thread fluid.
- **Observability**: Centralized logging using `consola` for easier debugging and monitoring.

## 📄 License



This project is licensed under the MIT License.


