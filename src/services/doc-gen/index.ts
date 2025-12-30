import { ocrEvents } from '@/services/ocr/events'
import { queueManager } from '@/services/queue'
import { db } from '@/db'
import { imageProcessor } from './image-processor'
import { markdownAssembler } from './markdown'
import type { OCRResult } from '@/services/ocr'

export class DocumentService {
    constructor() {
        this.init()
    }

    init() {
        // Listen to OCR success to trigger Markdown generation automatically
        ocrEvents.on('ocr:success', async ({ pageId, result }) => {
            // Inform that generation is queued
            ocrEvents.emit('doc:gen:queued', { pageId })

            // Add to generation queue
            await queueManager.addGenerationTask(pageId, async (signal) => {
                if (signal.aborted) return
                await this.generateMarkdown(pageId, result, signal)
            })
        })
    }

    async generateMarkdown(pageId: string, ocrResult: OCRResult, signal?: AbortSignal) {
        ocrEvents.emit('doc:gen:start', { pageId, type: 'markdown' })

        try {
            if (signal?.aborted) return

            // 1. Get original image
            const imageBlob = await db.getPageImage(pageId)
            if (!imageBlob) {
                throw new Error(`Image not found for page ${pageId}`)
            }

            if (signal?.aborted) return

            // 2. Slice images
            // imageProcessor handles db saving of extracted images
            const imageMap = await imageProcessor.sliceImages(pageId, imageBlob, ocrResult.boxes)

            if (signal?.aborted) return

            // 3. Assemble Markdown
            const markdown = markdownAssembler.assemble(ocrResult, imageMap)

            if (signal?.aborted) return

            // 4. Save Markdown
            await db.savePageMarkdown({
                pageId,
                content: markdown
            })

            ocrEvents.emit('doc:gen:success', { pageId, type: 'markdown' })

        } catch (error) {
            if (signal?.aborted) return

            console.error(`[DocumentService] Error generating markdown for ${pageId}`, error)
            const err = error instanceof Error ? error : new Error(String(error))
            ocrEvents.emit('doc:gen:error', { pageId, type: 'markdown', error: err })
            throw err
        }
    }
}

export const documentService = new DocumentService()
