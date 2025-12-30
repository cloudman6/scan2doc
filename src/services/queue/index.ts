import PQueue from 'p-queue'
import { queueLogger } from '@/utils/logger'

export class QueueManager {
    private ocrQueue: PQueue
    private generationQueue: PQueue
    private ocrControllers: Map<string, AbortController>
    private genControllers: Map<string, AbortController>

    constructor() {
        this.ocrQueue = new PQueue({ concurrency: 2 })
        this.generationQueue = new PQueue({ concurrency: 1 })
        this.ocrControllers = new Map()
        this.genControllers = new Map()

        this.ocrQueue.on('active', () => {
            queueLogger.debug(`[OCR Queue] Size: ${this.ocrQueue.size}  Pending: ${this.ocrQueue.pending}`)
        })

        this.generationQueue.on('active', () => {
            queueLogger.debug(`[Gen Queue] Size: ${this.generationQueue.size}  Pending: ${this.generationQueue.pending}`)
        })
    }

    /**
     * Add an OCR task to the queue
     * @param pageId The ID of the page to process
     * @param taskFn The task function that accepts an AbortSignal
     */
    async addOCRTask(pageId: string, taskFn: (signal: AbortSignal) => Promise<void>) {
        if (this.ocrControllers.has(pageId)) {
            queueLogger.info(`[QueueManager] Existing OCR task for ${pageId} found. Canceling.`)
            this.cancelOCR(pageId)
        }

        const controller = new AbortController()
        this.ocrControllers.set(pageId, controller)

        // We don't await the queue.add here because we want to return immediately after queuing
        this.ocrQueue.add(async () => {
            if (controller.signal.aborted) {
                queueLogger.info(`[QueueManager] OCR task for page ${pageId} was aborted before start.`)
                return
            }

            try {
                await taskFn(controller.signal)
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    queueLogger.info(`[QueueManager] OCR task for page ${pageId} aborted during execution.`)
                } else {
                    queueLogger.error(`[QueueManager] OCR task for page ${pageId} failed:`, error)
                }
            } finally {
                if (this.ocrControllers.get(pageId) === controller) {
                    this.ocrControllers.delete(pageId)
                }
            }
        }).catch(err => {
            queueLogger.error(`[QueueManager] Queue fatal error for page ${pageId}`, err)
        })
    }

    /**
      * Add a generation task (e.g. Markdown, PDF generation)
      */
    async addGenerationTask(pageId: string, taskFn: (signal: AbortSignal) => Promise<void>) {
        if (this.genControllers.has(pageId)) {
            queueLogger.info(`[QueueManager] Existing Gen task for ${pageId} found. Canceling.`)
            this.cancelGeneration(pageId)
        }

        const controller = new AbortController()
        this.genControllers.set(pageId, controller)

        this.generationQueue.add(async () => {
            if (controller.signal.aborted) return

            try {
                await taskFn(controller.signal)
            } catch (error) {
                if (!(error instanceof Error && error.name === 'AbortError')) {
                    queueLogger.error(`[QueueManager] Gen Task for page ${pageId} failed:`, error)
                }
            } finally {
                if (this.genControllers.get(pageId) === controller) {
                    this.genControllers.delete(pageId)
                }
            }
        }).catch(err => {
            queueLogger.error(`[QueueManager] Gen Queue fatal error for page ${pageId}`, err)
        })
    }

    /**
     * Cancel OCR task for a specific page
     */
    cancelOCR(pageId: string) {
        const controller = this.ocrControllers.get(pageId)
        if (controller) {
            controller.abort()
            this.ocrControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled OCR task for page ${pageId}`)
        }
    }

    /**
     * Cancel Generation task for a specific page
     */
    cancelGeneration(pageId: string) {
        const controller = this.genControllers.get(pageId)
        if (controller) {
            controller.abort()
            this.genControllers.delete(pageId)
            queueLogger.info(`[QueueManager] Cancelled Generation task for page ${pageId}`)
        }
    }

    /**
     * Cancel all tasks for a specific page
     */
    cancel(pageId: string) {
        this.cancelOCR(pageId)
        this.cancelGeneration(pageId)
    }

    /**
     * Clear all queues
     */
    clear() {
        this.ocrQueue.clear()
        this.generationQueue.clear()

        for (const [pageId] of this.ocrControllers) {
            this.cancelOCR(pageId)
        }
        for (const [pageId] of this.genControllers) {
            this.cancelGeneration(pageId)
        }

        queueLogger.info('[QueueManager] Cleared all queues')
    }

    getStats() {
        return {
            ocr: {
                effectiveSize: this.ocrControllers.size,
                size: this.ocrQueue.size,
                pending: this.ocrQueue.pending,
                isPaused: this.ocrQueue.isPaused
            },
            generation: {
                effectiveSize: this.genControllers.size,
                size: this.generationQueue.size,
                pending: this.generationQueue.pending,
                isPaused: this.generationQueue.isPaused
            }
        }
    }
}

export const queueManager = new QueueManager()
