import { describe, it, expect, vi, beforeEach } from 'vitest'
import { docxGenerator } from './docx'
import { db } from '@/db'

// Mock db
vi.mock('@/db', () => ({
    db: {
        getPageExtractedImage: vi.fn(),
        savePageDOCX: vi.fn()
    }
}))

describe('DocxGenerator', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should generate a DOCX blob from a simple Markdown string', async () => {
        const markdown = '# Heading 1\n\nThis is a paragraph with **bold** and *italic* text.'
        const blob = await docxGenerator.generate(markdown)

        expect(blob).toBeDefined()
        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle images with scan2doc-img: protocol', async () => {
        const imageId = 'test-image-123'
        const markdown = `Check this image:\n\n![Figure 1](scan2doc-img:${imageId})`

        // Mock image data
        const mockImageBuffer = new ArrayBuffer(8)
        vi.mocked(db.getPageExtractedImage).mockResolvedValue({
            id: imageId,
            pageId: 'page1',
            blob: mockImageBuffer,
            box: [0, 0, 100, 100]
        })

        const blob = await docxGenerator.generate(markdown)

        expect(blob).toBeDefined()
        expect(db.getPageExtractedImage).toHaveBeenCalledWith(imageId)
    })

    it('should correctly handle heading levels', async () => {
        const markdown = '# H1\n## H2\n### H3'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should handle lists (implicitly as paragraphs for now)', async () => {
        const markdown = '- Item 1\n- Item 2'
        const blob = await docxGenerator.generate(markdown)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('should not crash on empty markdown', async () => {
        const blob = await docxGenerator.generate('')
        expect(blob.size).toBeGreaterThan(0)
    })
})
