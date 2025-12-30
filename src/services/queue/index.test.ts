import { describe, it, expect, vi, beforeEach } from 'vitest'
import { queueManager } from './index'
import { queueLogger } from '@/utils/logger'

describe('QueueManager', () => {
    beforeEach(() => {
        queueManager.clear()
        // Using real timers to avoid p-queue/fake-timer issues
    })

    it('should process OCR tasks', async () => {
        const taskFn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await queueManager.addOCRTask('page1', taskFn)

        // Wait a bit for it to start
        await new Promise(r => setTimeout(r, 10))
        expect(queueManager.getStats().ocr.pending).toBe(1)

        // Wait for it to finish (status change)
        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        })

        expect(taskFn).toHaveBeenCalled()
    })

    it('should support concurrency limit', async () => {
        // OCR queue has concurrency 2
        const slowTask = async () => new Promise<void>(resolve => setTimeout(resolve, 100))

        await queueManager.addOCRTask('p1', slowTask)
        await queueManager.addOCRTask('p2', slowTask)
        await queueManager.addOCRTask('p3', slowTask)

        // Wait for start
        await new Promise(r => setTimeout(r, 10))

        expect(queueManager.getStats().ocr.pending).toBe(2)
        // Size = pending + queued = 2 + 1 = 3
        expect(queueManager.getStats().ocr.size).toBe(3)

        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        }, { timeout: 1000 })
    })

    it('should cancel pending task', async () => {
        const taskFn = vi.fn()

        // Fill the queue first
        await queueManager.addOCRTask('p1', async () => new Promise(resolve => setTimeout(resolve, 50)))
        await queueManager.addOCRTask('p2', async () => new Promise(resolve => setTimeout(resolve, 50)))

        // Add waiting task
        await queueManager.addOCRTask('p3', taskFn)

        // Cancel p3 before it starts
        queueManager.cancel('p3')

        await vi.waitFor(() => {
            if (queueManager.getStats().ocr.pending !== 0) throw new Error('Not finished')
        })

        expect(taskFn).not.toHaveBeenCalled()
    })

    it('should abort running task', async () => {
        const abortFn = vi.fn()

        await queueManager.addOCRTask('p1', async (signal) => {
            signal.addEventListener('abort', abortFn)
            // Wait long enough to be aborted
            await new Promise(resolve => setTimeout(resolve, 200))
        })

        await new Promise(r => setTimeout(r, 50))
        expect(queueManager.getStats().ocr.pending).toBe(1)

        queueManager.cancel('p1')

        await vi.waitFor(() => {
            expect(abortFn).toHaveBeenCalled()
        })
    })

    it('should auto-cancel previous task for same pageId', async () => {
        const abortFn = vi.fn()
        const task1 = async (signal: AbortSignal) => {
            signal.addEventListener('abort', abortFn)
            await new Promise(resolve => setTimeout(resolve, 100))
        }

        await queueManager.addOCRTask('p1', task1)

        await new Promise(r => setTimeout(r, 20))

        // Add another task for p1 immediately
        await queueManager.addOCRTask('p1', async () => { })

        // Verify task1 was aborted
        await vi.waitFor(() => {
            expect(abortFn).toHaveBeenCalled()
        })
    })

    it('should process Generation tasks', async () => {
        const taskFn = vi.fn().mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50))
        })

        await queueManager.addGenerationTask('gen1', taskFn)

        // Wait start
        await new Promise(r => setTimeout(r, 10))

        expect(queueManager.getStats().generation.pending).toBe(1)
        expect(queueManager.getStats().generation.size).toBe(1)

        await vi.waitFor(() => {
            if (queueManager.getStats().generation.pending !== 0) throw new Error('Not finished')
        })

        expect(taskFn).toHaveBeenCalled()
    })

    it('should cancel generation task', async () => {
        const genFn = vi.fn()

        // Block queue
        await queueManager.addGenerationTask('g1', async () => new Promise(r => setTimeout(r, 50)))

        await queueManager.addGenerationTask('g2', genFn)

        queueManager.cancel('g2')

        await vi.waitFor(() => {
            if (queueManager.getStats().generation.pending !== 0) throw new Error('Not finished')
        })

        expect(genFn).not.toHaveBeenCalled()
    })

    it('should handle errors in OCR task', async () => {
        const consoleSpy = vi.spyOn(queueLogger, 'error')

        await queueManager.addOCRTask('ocr_err', async () => {
            throw new Error('OCR failed')
        })

        await vi.waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('OCR task for page ocr_err failed'), expect.any(Error))
        })
    })

    it('should handle errors in generation task', async () => {
        const error = new Error('Gen Fail')
        const consoleSpy = vi.spyOn(queueLogger, 'error').mockImplementation(() => { })

        await queueManager.addGenerationTask('g-err', async () => {
            throw error
        })

        await vi.waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Gen Task for page g-err failed'), expect.any(Error))
        })

        consoleSpy.mockRestore()
    })
})
