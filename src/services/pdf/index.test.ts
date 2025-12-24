import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pdfService } from '@/services/pdf/index'
import * as pdfjsLib from 'pdfjs-dist'
import { queuePDFPages, resumePDFProcessing } from '@/services/pdf/pdfQueue'
import { pdfEvents } from '@/services/pdf/events'
import { db } from '@/db/index'
import { pdfLogger } from '@/services/logger'

// Mock dependencies
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {
    workerSrc: ''
  },
  version: '2.10.377'
}))

vi.mock('@/services/pdf/pdfQueue', () => ({
  queuePDFPages: vi.fn(),
  resumePDFProcessing: vi.fn()
}))

vi.mock('@/services/pdf/events', () => ({
  pdfEvents: {
    emit: vi.fn()
  }
}))

vi.mock('@/db/index', () => ({
  db: {
    saveFile: vi.fn().mockResolvedValue('file-id-123')
  }
}))

vi.mock('@/services/logger', () => ({
  pdfLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@/services/pdf/enhancedPdfRenderer', () => ({
  enhancedPdfRenderer: {
    initialize: vi.fn().mockResolvedValue(undefined)
  }
}))

// Globals
const originalFileReader = global.FileReader
const originalCreateElement = document.createElement

describe('PDFService', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Mock FileReader
    global.FileReader = class MockFileReader {
      readAsDataURL() {
        // @ts-ignore
        this.onload && this.onload()
      }
      result = 'data:application/pdf;base64,Zm9v' // 'foo' in base64
    } as any

    // Mock Canvas
    const mockContext = {
      drawImage: vi.fn(),
    }
    const mockCanvas = {
      getContext: vi.fn().mockReturnValue(mockContext),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,thumb'),
      width: 0,
      height: 0
    }
    // @ts-ignore
    document.createElement = vi.fn((tag) => {
      if (tag === 'canvas') return mockCanvas
      return originalCreateElement.call(document, tag)
    })
  })

  afterEach(() => {
    global.FileReader = originalFileReader
    document.createElement = originalCreateElement
  })

  describe('validatePDF', () => {
    it('should fail if file is null/undefined', () => {
      expect(pdfService.validatePDF(undefined as any)).toEqual({ valid: false, error: 'Please select a file!' })
    })

    it('should fail for non-pdf types', () => {
      const file = new File([''], 'test.txt', { type: 'text/plain' })
      expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('Please select a valid PDF file') })
    })

    it('should fail for empty files', () => {
      const file = new File([], 'empty.pdf', { type: 'application/pdf' })
      // File constructor creates empty file by default size 0
      expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('is empty') })
    })

    it('should fail for large files > 100MB', () => {
      // Mock size
      const file = {
        name: 'large.pdf',
        type: 'application/pdf',
        size: 101 * 1024 * 1024
      } as File
      expect(pdfService.validatePDF(file)).toEqual({ valid: false, error: expect.stringContaining('too large') })
    })

    it('should pass for valid pdf', () => {
      const file = {
        name: 'valid.pdf',
        type: 'application/pdf',
        size: 1024,
        lastModified: 123
      } as unknown as File
      expect(pdfService.validatePDF(file)).toEqual({ valid: true })
    })
  })

  describe('loadPDF', () => {
    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 500, height: 800 }),
      cleanup: vi.fn()
    }
    const mockDoc = {
      numPages: 2,
      getMetadata: vi.fn().mockResolvedValue({
        info: { Title: 'Test PDF', Author: 'Tester' }
      }),
      getPage: vi.fn().mockResolvedValue(mockPage)
    }

    it('should load PDF and extract info', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.resolve(mockDoc)
      } as any)

      const file = new File(['dummy'], 'test.pdf', { type: 'application/pdf' })
      // Override validatePDF to pass explicitly or rely on default behaviour if mocked file is valid
      // But validatePDF uses file.size, and new File(['dummy']) has size 5.

      const result = await pdfService.loadPDF(file)

      expect(pdfjsLib.getDocument).toHaveBeenCalled()
      expect(result.pageCount).toBe(2)
      expect(result.metadata?.title).toBe('Test PDF')
      expect(result.pages).toHaveLength(2)
      expect(result.pages[0].width).toBe(500)
    })

    it('should throw error if validation fails', async () => {
      const file = new File([], 'empty.pdf', { type: 'application/pdf' })
      await expect(pdfService.loadPDF(file)).rejects.toThrow('is empty')
    })

    it('should throw error if pdf loading fails', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({
        promise: Promise.reject(new Error('PDF Corrupt'))
      } as any)
      const file = new File(['x'], 'corrupt.pdf', { type: 'application/pdf' })

      await expect(pdfService.loadPDF(file)).rejects.toThrow('PDF Corrupt')
      expect(pdfLogger.error).toHaveBeenCalled()
    })
  })

  describe('processPDF', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const mockDoc = {
      numPages: 5,
      getMetadata: vi.fn().mockResolvedValue({}),
      getPage: vi.fn().mockResolvedValue({ getViewport: () => ({}), cleanup: () => { } }),
      base64Data: 'Zm9v' // 'foo'
    }

    it('should process PDF successfully', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)

      await pdfService.processPDF(file)

      expect(db.saveFile).toHaveBeenCalledWith(expect.objectContaining({ name: 'test.pdf' }))
      expect(pdfEvents.emit).toHaveBeenCalledWith('pdf:log', expect.anything())
      expect(queuePDFPages).toHaveBeenCalledWith(file, expect.any(ArrayBuffer), 5, 'file-id-123')
    })

    it('should handle db save error but continue', async () => {
      vi.mocked(db.saveFile).mockRejectedValueOnce(new Error('DB Error'))
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)

      await pdfService.processPDF(file)

      expect(pdfLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to save source file'), expect.any(Error))
      expect(queuePDFPages).toHaveBeenCalled() // Should still proceed
    })

    it('should handle errors and emit error event', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Load failed')) } as any)

      await pdfService.processPDF(file)

      expect(pdfLogger.error).toHaveBeenCalledWith('Error processing PDF:', expect.any(Error))
      expect(pdfEvents.emit).toHaveBeenCalledWith('pdf:processing-error', expect.anything())
    })
  })

  describe('generateThumbnail', () => {
    const mockPage = {
      getViewport: vi.fn().mockReturnValue({ width: 1000, height: 1000 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn()
    }
    const mockDoc = {
      getPage: vi.fn().mockResolvedValue(mockPage)
    }

    it('should render page to canvas and return data url', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)

      const thumb = await pdfService.generateThumbnail(new ArrayBuffer(10), 1)

      expect(mockPage.render).toHaveBeenCalled()
      expect(thumb).toBe('data:image/jpeg;base64,thumb')
    })

    it('should throw error on failure', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Fail')) } as any)

      await expect(pdfService.generateThumbnail(new ArrayBuffer(10), 1)).rejects.toThrow('Fail')
      expect(pdfLogger.error).toHaveBeenCalled()
    })
  })

  describe('resumeProcessing', () => {
    it('should call pdfQueue.resumePDFProcessing', async () => {
      await pdfService.resumeProcessing()
      expect(resumePDFProcessing).toHaveBeenCalled()
    })
  })

  describe('cache operations', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })

    it('should retrieve cached PDF', async () => {
      // Load first to cache
      const mockDoc = { numPages: 1, getMetadata: async () => ({}), getPage: async () => ({ getViewport: () => ({}), cleanup: () => { } }) }
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)
      await pdfService.loadPDF(file)

      const cached = pdfService.getCachedPDF(file)
      expect(cached).toBeDefined()
      expect(cached?.file).toBe(file)
    })

    it('should clear cache', async () => {
      pdfService.clearCache()
      const cached = pdfService.getCachedPDF(file)
      expect(cached).toBeUndefined()
    })
  })

  describe('getPDFMetadata', () => {
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    const mockDoc = {
      numPages: 10,
      getMetadata: vi.fn().mockResolvedValue({
        info: { Title: 'Metadata Title', Author: 'Metadata Author', Subject: 'Test Subject' }
      }),
      getPage: vi.fn().mockResolvedValue({ getViewport: () => ({}), cleanup: () => { } })
    }

    it('should return extracted metadata', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(mockDoc) } as any)

      const metadata = await pdfService.getPDFMetadata(file)

      expect(metadata.pageCount).toBe(10)
      expect(metadata.title).toBe('Metadata Title')
      expect(metadata.author).toBe('Metadata Author')
      expect(metadata.subject).toBe('Test Subject')
    })

    it('should return empty object on error', async () => {
      vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.reject(new Error('Load failed')) } as any)

      const metadata = await pdfService.getPDFMetadata(file)

      expect(metadata).toEqual({})
      expect(pdfLogger.error).toHaveBeenCalled()
    })
  })

  describe('getPageCount and getPageInfo', () => {
    const mockPDFDoc = {
      pageCount: 5,
      pages: [
        { pageNumber: 1, width: 100, height: 200 },
        { pageNumber: 2, width: 100, height: 200 }
      ]
    } as any

    it('should return correct page count', () => {
      expect(pdfService.getPageCount(mockPDFDoc)).toBe(5)
    })

    it('should return correct page info', () => {
      expect(pdfService.getPageInfo(mockPDFDoc, 1)).toEqual({ pageNumber: 1, width: 100, height: 200 })
      expect(pdfService.getPageInfo(mockPDFDoc, 99)).toBeUndefined()
    })
  })
})
