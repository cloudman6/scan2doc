import { describe, it, expect, vi } from 'vitest'
import { OCRService, type OCRProvider, type OCRResult } from './index'
import { db } from '@/db'
import { ocrEvents } from './events'
import { queueManager } from '@/services/queue'

vi.mock('@/db', () => ({
  db: {
    savePageOCR: vi.fn(),
    getPageImage: vi.fn()
  }
}))

vi.mock('./events', () => ({
  ocrEvents: {
    emit: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('@/services/queue', () => ({
  queueManager: {
    addOCRTask: vi.fn()
  }
}))

describe('OCRService', () => {
  const mockResult: OCRResult = {
    success: true,
    text: 'test text',
    raw_text: '<|ref|>test text<|/ref|>',
    boxes: [],
    image_dims: { w: 100, h: 100 },
    prompt_type: 'document'
  }

  const mockProvider: OCRProvider = {
    name: 'test-provider',
    process: vi.fn().mockResolvedValue(mockResult)
  }

  it('should register and return available providers', () => {
    const service = new OCRService()
    service.registerProvider('test', mockProvider)

    expect(service.getAvailableProviders()).toContain('test')
  })

  it('should process image with a registered provider', async () => {
    const service = new OCRService()
    service.registerProvider('test', mockProvider)

    const blob = new Blob(['test'], { type: 'image/png' })
    const result = await service.processImage(blob, 'test')

    expect(result).toEqual(mockResult)
    expect(mockProvider.process).toHaveBeenCalledWith(blob, undefined)
  })

  it('should throw error if provider is not found', async () => {
    const service = new OCRService()

    await expect(service.processImage('data...', 'unknown'))
      .rejects.toThrow("OCR provider 'unknown' not found")
  })

  it('should pass options to provider', async () => {
    const service = new OCRService()
    service.registerProvider('test', mockProvider)
    const options = { prompt_type: 'format_instruction' }

    await service.processImage('data...', 'test', options)

    expect(mockProvider.process).toHaveBeenCalledWith('data...', options)
  })

  describe('queueOCR', () => {
    it('should queue task and emit events', async () => {
      const service = new OCRService()
      service.registerProvider('deepseek', mockProvider)

      const pageId = 'test-page'
      const blob = new Blob(['test'], { type: 'image/png' })

      let taskPromise: Promise<void> | undefined;

      // Spy on queueManager
      const addOCRTaskSpy = vi.spyOn(queueManager, 'addOCRTask').mockImplementation((_id: string, task: (signal: AbortSignal) => Promise<void>) => {
        // Execute task immediately for testing and capture promise
        const signal = new AbortController().signal
        taskPromise = task(signal)
        return Promise.resolve()
      })

      // Spy on ocrEvents
      const emitSpy = vi.spyOn(ocrEvents, 'emit')

      // Spy on db
      const savePageOCRSpy = vi.spyOn(db, 'savePageOCR').mockResolvedValue(undefined)

      await service.queueOCR(pageId, blob)

      // Wait for task to complete
      if (taskPromise) await taskPromise

      expect(emitSpy).toHaveBeenCalledWith('ocr:queued', { pageId })
      expect(addOCRTaskSpy).toHaveBeenCalledWith(pageId, expect.any(Function))
      expect(emitSpy).toHaveBeenCalledWith('ocr:start', { pageId })
      expect(mockProvider.process).toHaveBeenCalled()
      expect(savePageOCRSpy).toHaveBeenCalledWith(expect.objectContaining({
        pageId,
        data: mockResult
      }))
      expect(emitSpy).toHaveBeenCalledWith('ocr:success', { pageId, result: mockResult })
    })

    it('should handle errors in queued task', async () => {
      const service = new OCRService()
      const error = new Error('OCR Failed')
      mockProvider.process = vi.fn().mockRejectedValue(error)
      service.registerProvider('deepseek', mockProvider)

      const pageId = 'error-page'
      const blob = new Blob(['test'], { type: 'image/png' })

      let taskPromise: Promise<void> | undefined;

      vi.spyOn(queueManager, 'addOCRTask').mockImplementation((_id: string, task: (signal: AbortSignal) => Promise<void>) => {
        const signal = new AbortController().signal
        taskPromise = task(signal)
        return Promise.resolve()
      })
      const emitSpy = vi.spyOn(ocrEvents, 'emit')

      try {
        await service.queueOCR(pageId, blob)
      } catch {
        // Task throws
      }

      // Wait for task completion (it will throw)
      if (taskPromise) {
        try {
          await taskPromise
        } catch {
          // Expected
        }
      }

      expect(emitSpy).toHaveBeenCalledWith('ocr:error', { pageId, error })
    })

    it('should handle abort signal', async () => {
      const service = new OCRService()
      service.registerProvider('deepseek', mockProvider)
      const pageId = 'abort-page'
      const blob = new Blob(['test'], { type: 'image/png' })

      let taskPromise: Promise<void> | undefined;

      vi.spyOn(queueManager, 'addOCRTask').mockImplementation((_id: string, task: (signal: AbortSignal) => Promise<void>) => {
        const controller = new AbortController()
        controller.abort() // Abort immediately
        taskPromise = task(controller.signal)
        return Promise.resolve()
      })
      const emitSpy = vi.spyOn(ocrEvents, 'emit')
      const saveSpy = vi.spyOn(db, 'savePageOCR')

      await service.queueOCR(pageId, blob)

      if (taskPromise) await taskPromise

      // Should emit queued
      expect(emitSpy).toHaveBeenCalledWith('ocr:queued', { pageId })
      // Should NOT emit start if aborted before start (depends on check)
      // In implementation: simple check at start.
      // If aborted at start, it returns.
      expect(emitSpy).not.toHaveBeenCalledWith('ocr:start', expect.anything())
      expect(saveSpy).not.toHaveBeenCalled()
    })
  })

  describe('queueBatchOCR', () => {
    it('should queue all ready pages', async () => {
      const service = new OCRService()
      service.registerProvider('deepseek', mockProvider)

      // Mock pages with ready status
      const pages = [
        { id: 'page1', status: 'ready' },
        { id: 'page2', status: 'ready' }
      ] as Array<{ id: string; status: string }>

      const blobs = [new Blob(['test1']), new Blob(['test2'])]
      let taskIndex = 0

      vi.spyOn(queueManager, 'addOCRTask').mockImplementation((_id: string, _task: (signal: AbortSignal) => Promise<void>) => {
        // Fire and forget - just trigger queue emission
        return Promise.resolve()
      })

      vi.spyOn(db, 'getPageImage').mockImplementation(async (_id: string) => {
        return blobs[taskIndex++]
      })

      const emitSpy = vi.spyOn(ocrEvents, 'emit')

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 2, skipped: 0, failed: 0 })
      expect(emitSpy).toHaveBeenCalledWith('ocr:queued', { pageId: 'page1' })
      expect(emitSpy).toHaveBeenCalledWith('ocr:queued', { pageId: 'page2' })
    })

    it('should skip pages with pending_ocr, recognizing, ocr_success, and completed status', async () => {
      const service = new OCRService()

      const pages = [
        { id: 'page1', status: 'pending_ocr' },
        { id: 'page2', status: 'recognizing' },
        { id: 'page3', status: 'ocr_success' },
        { id: 'page4', status: 'ready' },
        { id: 'page5', status: 'markdown_success' },
        { id: 'page6', status: 'completed' }
      ] as Array<{ id: string; status: string }>

      vi.spyOn(queueManager, 'addOCRTask').mockResolvedValue(undefined)
      vi.spyOn(db, 'getPageImage').mockResolvedValue(new Blob(['test']))

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 1, skipped: 5, failed: 0 })
    })

    it('should retry pages with error status', async () => {
      const service = new OCRService()
      service.registerProvider('deepseek', mockProvider)

      const pages = [
        { id: 'page1', status: 'error' },
        { id: 'page2', status: 'ready' }
      ] as Array<{ id: string; status: string }>

      let callCount = 0
      vi.spyOn(queueManager, 'addOCRTask').mockImplementation((_id: string, _task: (signal: AbortSignal) => Promise<void>) => {
        callCount++
        return Promise.resolve()
      })

      vi.spyOn(db, 'getPageImage').mockResolvedValue(new Blob(['test']))

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 2, skipped: 0, failed: 0 })
      expect(callCount).toBe(2)
    })

    it('should skip pages with pending_render or rendering status', async () => {
      const service = new OCRService()

      const pages = [
        { id: 'page1', status: 'pending_render' },
        { id: 'page2', status: 'rendering' },
        { id: 'page3', status: 'ready' }
      ] as Array<{ id: string; status: string }>

      vi.spyOn(queueManager, 'addOCRTask').mockResolvedValue(undefined)
      vi.spyOn(db, 'getPageImage').mockResolvedValue(new Blob(['test']))

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 1, skipped: 2, failed: 0 })
    })

    it('should handle failed image retrieval', async () => {
      const service = new OCRService()

      const pages = [
        { id: 'page1', status: 'ready' },
        { id: 'page2', status: 'ready' }
      ] as Array<{ id: string; status: string }>

      vi.spyOn(queueManager, 'addOCRTask').mockResolvedValue(undefined)
      vi.spyOn(db, 'getPageImage')
        .mockResolvedValueOnce(new Blob(['test1']))
        .mockResolvedValueOnce(null) // Second page fails

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 1, skipped: 0, failed: 1 })
    })

    it('should return all skipped when no pages can be queued', async () => {
      const service = new OCRService()

      const pages = [
        { id: 'page1', status: 'ocr_success' },
        { id: 'page2', status: 'recognizing' }
      ] as Array<{ id: string; status: string }>

      vi.spyOn(queueManager, 'addOCRTask').mockResolvedValue(undefined)

      const result = await service.queueBatchOCR(pages as any)

      expect(result).toEqual({ queued: 0, skipped: 2, failed: 0 })
    })
  })
})
