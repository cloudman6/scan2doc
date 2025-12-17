// Main service entry point
// Export all services for easy access

export { pdfService, PDFService } from './pdf'
export type { PDFPageInfo, PDFProcessingOptions } from './pdf'

export { ocrService, OCRService } from './ocr'
export type {
  OCRProvider,
  OCROptions,
  OCRResult,
  OCRWord,
  OCRLine,
  BoundingBox
} from './ocr'

export { exportService, ExportService } from './export'
export type { ExportOptions, ExportResult } from './export'