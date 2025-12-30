import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocumentService } from './index'
import { ocrEvents } from '@/services/ocr/events'
import { db } from '@/db'
import { imageProcessor } from './image-processor'
import { queueManager } from '@/services/queue'

// Mock dependencies
vi.mock('@/db', () => ({
    db: {
        getPageImage: vi.fn(),
        savePageMarkdown: vi.fn(),
        savePageDOCX: vi.fn()
    }
}))

vi.mock('./image-processor', () => ({
    imageProcessor: {
        sliceImages: vi.fn()
    }
}))

vi.mock('@/services/queue', () => ({
    queueManager: {
        addGenerationTask: vi.fn()
    }
}))

describe('DocumentService Integration', () => {
    let service: DocumentService

    beforeEach(() => {
        vi.clearAllMocks()
        service = new DocumentService()
    })

    it('should handle ocr:success and queue generation task', async () => {
        const pageId = 'page1'
        const result = { text: 'test', boxes: [] }

        // Trigger event
        ocrEvents.emit('ocr:success', { pageId, result })

        expect(queueManager.addGenerationTask).toHaveBeenCalledWith(pageId, expect.any(Function))
    })

    it('should generate markdown and then docx', async () => {
        const pageId = 'page1'
        const result = { text: 'test', boxes: [] }
        const mockImage = new Blob(['image'], { type: 'image/png' })

        vi.mocked(db.getPageImage).mockResolvedValue(mockImage)
        vi.mocked(imageProcessor.sliceImages).mockResolvedValue(new Map())

        const startEvents: string[] = []
        const successEvents: string[] = []

        ocrEvents.on('doc:gen:start', (payload) => startEvents.push(payload.type))
        ocrEvents.on('doc:gen:success', (payload) => successEvents.push(payload.type))

        await service.generateMarkdown(pageId, result)

        expect(db.savePageMarkdown).toHaveBeenCalled()
        expect(db.savePageDOCX).toHaveBeenCalled()

        expect(startEvents).toContain('markdown')
        expect(startEvents).toContain('docx')
        expect(successEvents).toContain('markdown')
        expect(successEvents).toContain('docx')
    })
})
