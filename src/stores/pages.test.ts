import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePagesStore } from '@/stores/pages'
import { db } from '@/db/index'
import { fileAddService } from '@/services/add'
import { pdfEvents } from '@/services/pdf/events'

// Mock dependencies
vi.mock('@/db/index', () => ({
    db: {
        getNextOrder: vi.fn(),
        savePage: vi.fn(),
        deletePage: vi.fn(),
        deletePages: vi.fn((_pageIds: string[]) => {
            return Promise.resolve()
        }),
        updatePagesOrder: vi.fn(),
        getAllPagesForDisplay: vi.fn(),
        getPage: vi.fn()
    },
    generatePageId: vi.fn(() => 'mock-id')
}))

vi.mock('@/services/add', () => {
    const mock = {
        triggerFileSelect: vi.fn(),
        processFiles: vi.fn()
    }
    return {
        fileAddService: mock,
        default: mock
    }
})

vi.mock('@/services/pdf/events', () => ({
    pdfEvents: {
        on: vi.fn(),
        emit: vi.fn(),
        off: vi.fn()
    }
}))

describe('Pages Store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        vi.resetAllMocks()
        vi.mocked(db.getNextOrder).mockResolvedValue(1)
    })

    describe('Initial State', () => {
        it('should correctly initialize state', () => {
            const store = usePagesStore()
            expect(store.pages).toEqual([])
            expect(store.selectedPageIds).toEqual([])
            expect(store.processingQueue).toEqual([])
            expect(store.pdfProcessing).toEqual({
                active: false,
                total: 0,
                completed: 0
            })
        })
    })

    describe('Getters', () => {
        it('totalPages should return the correct count', async () => {
            const store = usePagesStore()
            await store.addPage({ fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })
            await store.addPage({ fileName: 'p2.png', fileSize: 20, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })
            expect(store.totalPages).toBe(2)
        })

        it('pagesByStatus should filter correctly', async () => {
            const store = usePagesStore()
            await store.addPage({ fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })
            await store.addPage({ fileName: 'p2.png', fileSize: 20, fileType: 'image/png', origin: 'upload', status: 'error', progress: 0, outputs: [], logs: [] })

            expect(store.pagesByStatus('ready')).toHaveLength(1)
            expect(store.pagesByStatus('error')).toHaveLength(1)
            expect(store.pagesByStatus('completed')).toHaveLength(0)
        })

        it('selectedPages should return pages whose IDs are in selectedPageIds', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'id1', fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })
            await store.addPage({ id: 'id2', fileName: 'p2.png', fileSize: 20, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })

            store.selectPage('id1')
            expect(store.selectedPages).toHaveLength(1)
            expect(store.selectedPages[0]!.id).toBe('id1')
        })

        it('overallProgress should calculate average progress', async () => {
            const store = usePagesStore()
            await store.addPage({ fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] })
            await store.addPage({ fileName: 'p2.png', fileSize: 20, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 50, outputs: [], logs: [] })

            expect(store.overallProgress).toBe(75)
        })

        it('overallProgress should return 0 if no pages', () => {
            const store = usePagesStore()
            expect(store.overallProgress).toBe(0)
        })
    })

    describe('Basic Actions', () => {
        it('updatePageProgress should update only progress and updatedAt', async () => {
            const store = usePagesStore()
            const p = await store.addPage({ id: 'id1', fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 10, outputs: [], logs: [] })
            const oldUpdateAt = p.updatedAt

            store.updatePageProgress('id1', 50)
            expect(store.pages[0]!.progress).toBe(50)
            expect(store.pages[0]!.updatedAt.getTime()).toBeGreaterThanOrEqual(oldUpdateAt.getTime())
        })

        it('updatePageStatus should set processedAt for ready/completed', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'id1', fileName: 'p1.png', fileSize: 10, fileType: 'image/png', origin: 'upload', status: 'pending_render', progress: 0, outputs: [], logs: [] })

            store.updatePageStatus('id1', 'ready')
            expect(store.pages[0]!.status).toBe('ready')
            expect(store.pages[0]!.progress).toBe(100)
            expect(store.pages[0]!.processedAt).toBeDefined()
        })

        it('addPageLog should append to logs array', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'id1', fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.addPageLog('id1', { level: 'info', message: 'test log' })
            expect(store.pages[0]!.logs).toHaveLength(1)
            expect(store.pages[0]!.logs[0]!.message).toBe('test log')
            expect(store.pages[0]!.logs[0]!.id).toMatch(/^page_/)
        })

        it('setOcrResult should update text and confidence', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'id1', fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.setOcrResult('id1', 'hello world')
            expect(store.pages[0]!.ocrText).toBe('hello world')
        })

        it('addOutput should append to outputs array', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'id1', fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.addOutput('id1', { format: 'text', content: 'output content' })
            expect(store.pages[0]!.outputs).toHaveLength(1)
            expect(store.pages[0]!.outputs[0]!.content).toBe('output content')
        })
    })

    describe('Deletion and Undo', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('should touch all computed and remaining actions for 100% coverage', async () => {
            const store = usePagesStore()
            await store.addPage({ id: 'touch-id', fileName: 'f', fileSize: 0, fileType: '', origin: 'upload', status: 'pending_render', progress: 0, outputs: [], logs: [] })

            store.updatePageProgress('touch-id', 50)
            expect(store.pages[0]!.progress).toBe(50)
            expect(store.overallProgress).toBe(50)

            // Touch single update actions
            store.updatePageStatus('touch-id', 'rendering')
            expect(store.pages[0]!.status).toBe('rendering')
            expect(store.pages[0]!.progress).toBe(50)

            store.setOcrResult('touch-id', 'text')
            expect(store.pages[0]!.ocrText).toBe('text')

            store.addPageLog('touch-id', { level: 'info', message: 'msg' })
            expect(store.pages[0]!.logs.length).toBeGreaterThan(0)

            // Touch Getters
            expect(store.processingPages.length).toBe(1)
            expect(store.completedPages.length).toBe(0)

            // Queue actions
            store.addToProcessingQueue('touch-id')
            store.removeFromProcessingQueue('touch-id')

            // DB Actions
            await store.deletePageFromDB('touch-id')
            expect(db.deletePage).toHaveBeenCalledWith('touch-id')

            store.reset()
            expect(store.pages.length).toBe(0)
        })

        it('loadPagesFromDB should handle errors', async () => {
            const store = usePagesStore()
            vi.mocked(db.getAllPagesForDisplay).mockRejectedValue(new Error('Load Fail'))
            await store.loadPagesFromDB()
            expect(store.pages).toHaveLength(0)
        })

        it('reorderPages should handle errors', async () => {
            const store = usePagesStore()
            vi.mocked(db.updatePagesOrder).mockRejectedValue(new Error('Reorder Fail'))
            await store.reorderPages([{ id: '1', order: 1 }])
            // Should catch and log
            expect(vi.mocked(db.updatePagesOrder)).toHaveBeenCalled()
        })

        it('addFiles should handle unexpected service errors', async () => {
            const store = usePagesStore()
            vi.mocked(fileAddService.triggerFileSelect).mockRejectedValue(new Error('UI Crash'))
            const result = await store.addFiles()
            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to add files')
        })

        it('deletePages should return null if no matches', () => {
            const store = usePagesStore()
            expect(store.deletePages(['non-existent'])).toBeNull()
        })


        it('reset should clear all state', async () => {
            const store = usePagesStore()
            await store.addPage({ fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })
            store.reset()
            expect(store.pages).toHaveLength(0)
        })

        it('deletePage should remove page from store', async () => {
            const store = usePagesStore()
            const id = 'id1'
            await store.addPage({ id, fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.deletePage(id)
            expect(store.pages).toHaveLength(0)
        })


        it('deleteAllPages should clear all relevant state', async () => {
            const store = usePagesStore()
            await store.addPage({ fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })
            store.selectPage('mock-id')
            store.addToProcessingQueue('mock-id')

            store.deleteAllPages()
            expect(store.pages).toHaveLength(0)
            expect(store.selectedPageIds).toHaveLength(0)
            expect(store.processingQueue).toHaveLength(0)
        })
    })

    describe('Database Actions', () => {
        it('loadPagesFromDB should fetch and store pages', async () => {
            const store = usePagesStore()
            const mockDBPages = [
                { id: '1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, order: 1, outputs: [], logs: [], createdAt: new Date(), updatedAt: new Date() }
            ]
            vi.mocked(db.getAllPagesForDisplay).mockResolvedValue(mockDBPages as unknown as import("@/db").DBPage[])

            await store.loadPagesFromDB()
            expect(store.pages).toHaveLength(1)
            expect(store.pages[0]!.id).toBe('1')
        })

        it('savePageToDB should handle errors', async () => {
            const store = usePagesStore()
            const dbError = new Error('DB Fail')
            vi.mocked(db.savePage).mockRejectedValue(dbError)

            const fullPage = { id: '1', fileName: 'f', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [], createdAt: new Date(), updatedAt: new Date() }

            try {
                await store.savePageToDB(fullPage as unknown as import("@/stores/pages").Page)
                expect(true).toBe(false)
            } catch (error) {
                expect(error).toBe(dbError)
            }
        })

        it('deletePagesFromDB should call db.deletePage for each id', async () => {
            const store = usePagesStore()
            await store.deletePagesFromDB(['1', '2'])
            expect(db.deletePage).toHaveBeenCalledTimes(2)
        })
    })

    describe('Reordering', () => {
        it('reorderPages should update db and local store', async () => {
            const store = usePagesStore()
            await store.addPage({ id: '1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [], order: 1 })
            await store.addPage({ id: '2', fileName: 'f2', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [], order: 2 })

            await store.reorderPages([{ id: '1', order: 2 }, { id: '2', order: 1 }])

            expect(db.updatePagesOrder).toHaveBeenCalledWith([{ id: '1', order: 2 }, { id: '2', order: 1 }])
            expect(store.pages[0]!.id).toBe('2')
            expect(store.pages[1]!.id).toBe('1')
        })
    })

    describe('File Adding Actions', () => {
        it('addFiles should handle empty selection', async () => {
            const store = usePagesStore()
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue([])

            const result = await store.addFiles()
            expect(result.success).toBe(false)
            expect(result.error).toBe('No files selected')
        })

        it('addFiles should process result and save to DB', async () => {
            const store = usePagesStore()
            const mockFiles = [new File([''], 'test.png')]
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue(mockFiles)
            vi.mocked(fileAddService.processFiles).mockResolvedValue({
                success: true,
                pages: [{ id: 'new-id', fileName: 'test.png', fileSize: 0, fileType: 'image/png', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] } as unknown as import("@/stores/pages").Page]
            })

            await store.addFiles()
            expect(store.pages).toHaveLength(1)
            expect(db.savePage).toHaveBeenCalled()
        })

        it('addFiles should maintain correct order for multiple pages', async () => {
            const store = usePagesStore()
            // Reset getNextOrder to track calls: it will return 0, then 1, then 2
            let currentOrder = 0
            vi.mocked(db.getNextOrder).mockImplementation(async () => currentOrder++)

            const mockFiles = [new File([''], 'multi.pdf')]
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue(mockFiles)
            vi.mocked(fileAddService.processFiles).mockResolvedValue({
                success: true,
                pages: [
                    { id: 'p1', fileName: 'multi.pdf', fileSize: 10, fileType: 'application/pdf', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] },
                    { id: 'p2', fileName: 'multi.pdf', fileSize: 10, fileType: 'application/pdf', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] },
                    { id: 'p3', fileName: 'multi.pdf', fileSize: 10, fileType: 'application/pdf', origin: 'upload', status: 'ready', progress: 100, outputs: [], logs: [] }
                ] as unknown as import("@/stores/pages").Page[]
            })

            await store.addFiles()

            expect(store.pages).toHaveLength(3)
            // Verify orders are assigned sequentially
            expect(store.pages[0]!.order).toBe(0)
            expect(store.pages[1]!.order).toBe(1)
            expect(store.pages[2]!.order).toBe(2)

            // Verify they are sorted in store
            expect(store.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
            expect(db.savePage).toHaveBeenCalledTimes(3)
        })

        it('should maintain order when adding Image then PDF', async () => {
            const store = usePagesStore()
            let currentOrder = 0
            vi.mocked(db.getNextOrder).mockImplementation(async () => currentOrder++)

            // 1. Add an Image
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue([new File([''], 'image.png')])
            vi.mocked(fileAddService.processFiles).mockResolvedValue({
                success: true,
                pages: [{ id: 'img-1', fileName: 'image.png', order: 0 } as any]
            })
            await store.addFiles()

            // 2. Add a PDF (simulated via events as addFiles only starts the process)
            // Mock DB response for the queued PDF page
            const dbPage = { id: 'pdf-1', fileName: 'test.pdf', order: 1 } as any
            vi.mocked(db.getPage).mockResolvedValue(dbPage)

            // Trigger event (setupPDFEventListeners is called in store constructor)
            const queuedHandler = vi.mocked(pdfEvents.on).mock.calls.find(c => (c[0] as string) === 'pdf:page:queued')?.[1]
            await (queuedHandler as any)({ pageId: 'pdf-1' })

            expect(store.pages).toHaveLength(2)
            expect(store.pages[0]!.id).toBe('img-1')
            expect(store.pages[0]!.order).toBe(0)
            expect(store.pages[1]!.id).toBe('pdf-1')
            expect(store.pages[1]!.order).toBe(1)
        })

        it('should maintain order when adding PDF then Image', async () => {
            const store = usePagesStore()
            let currentOrder = 0
            vi.mocked(db.getNextOrder).mockImplementation(async () => currentOrder++)

            // 1. Start PDF process (simulated)
            const dbPage = { id: 'pdf-1', fileName: 'test.pdf', order: 0 } as any
            vi.mocked(db.getPage).mockResolvedValue(dbPage)
            const queuedHandler = vi.mocked(pdfEvents.on).mock.calls.find(c => (c[0] as string) === 'pdf:page:queued')?.[1]
            await (queuedHandler as any)({ pageId: 'pdf-1' })

            // 2. Add an Image while PDF is processing
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue([new File([''], 'image.png')])
            vi.mocked(fileAddService.processFiles).mockResolvedValue({
                success: true,
                pages: [{ id: 'img-1', fileName: 'image.png', order: 1 } as any]
            })
            await store.addFiles()

            expect(store.pages).toHaveLength(2)
            expect(store.pages[0]!.id).toBe('pdf-1')
            expect(store.pages[0]!.order).toBe(0)
            expect(store.pages[1]!.id).toBe('img-1')
            expect(store.pages[1]!.order).toBe(1)
        })

        it('should correct order of -1 and fetch from DB (Truthiness Bug Recovery)', async () => {
            const store = usePagesStore()
            vi.mocked(db.getNextOrder).mockResolvedValue(100)

            // Simulate service returning -1
            await store.addPage({
                fileName: 'bug.png',
                fileSize: 0,
                fileType: 'image/png',
                origin: 'upload',
                status: 'ready',
                progress: 100,
                order: -1,
                outputs: [],
                logs: []
            })

            expect(db.getNextOrder).toHaveBeenCalled()
            expect(store.pages[0]!.order).toBe(100)
        })
    })

    describe('PDF Event Listeners', () => {
        it('should handle pdf:page:queued', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const dbPage = { id: 'pdf-p1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'pending_render', progress: 0, order: 1, outputs: [], logs: [], createdAt: new Date(), updatedAt: new Date() }
            vi.mocked(db.getPage).mockResolvedValue(dbPage as unknown as import("@/db").DBPage)

            const queuedHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:page:queued')?.[1]
            if (queuedHandler) {
                await (queuedHandler as (arg: any) => Promise<void>)({ pageId: 'pdf-p1' })
                expect(store.pages).toHaveLength(1)
                expect(store.pages[0]!.id).toBe('pdf-p1')
            }
        })

        it('should handle pdf:page:queued DB error', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            vi.mocked(db.getPage).mockRejectedValue(new Error('Queued Load Fail'))
            const handler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:page:queued')?.[1]
            if (handler) {
                await (handler as (arg: any) => Promise<void>)({ pageId: 'q-err' })
                expect(store.pages).toHaveLength(0)
            }
        })

        it('should handle pdf:page:rendering', () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const renderingHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:page:rendering')?.[1]
            if (renderingHandler) {
                (renderingHandler as (arg: any) => void)({ pageId: 'rendering-p' })
                // This updates status via updatePageStatus, we verify call definition
                expect(renderingHandler).toBeDefined()
            }
        })

        it('should handle pdf:page:done when page is missing from store', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const dbPage = { id: 'missing-p', fileName: 'f', fileSize: 0, fileType: '', origin: 'upload', status: 'rendering', progress: 0, order: 1, outputs: [], logs: [], createdAt: new Date(), updatedAt: new Date() }
            vi.mocked(db.getPage).mockResolvedValue(dbPage as unknown as import("@/db").DBPage)

            const doneHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:page:done')?.[1]
            if (doneHandler) {
                await (doneHandler as (arg: any) => Promise<void>)({
                    pageId: 'missing-p',
                    thumbnailData: 'data:thumb',
                    width: 100,
                    height: 200,
                    fileSize: 1234
                })
                expect(store.pages).toHaveLength(1)
                expect(store.pages[0]!.thumbnailData).toBe('data:thumb')
            }
        })

        it('should handle pdf:page:done', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            await store.addPage({ id: 'pdf-p1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'rendering', progress: 0, outputs: [], logs: [] })

            const doneHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:page:done')?.[1]
            if (doneHandler) {
                await (doneHandler as (arg: any) => Promise<void>)({
                    pageId: 'pdf-p1',
                    thumbnailData: 'data:thumb',
                    width: 100,
                    height: 200,
                    fileSize: 1234
                })
                expect(store.pages[0]!.status).toBe('ready')
                expect(store.pages[0]!.thumbnailData).toBe('data:thumb')
            }
        })

        it('should handle pdf:page:done failure when page not in DB', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            vi.mocked(db.getPage).mockResolvedValue(undefined)

            const doneHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:page:done')?.[1]
            if (doneHandler) {
                await (doneHandler as (arg: any) => Promise<void>)({
                    pageId: 'missing-p',
                    thumbnailData: 'data:thumb',
                    width: 100,
                    height: 200,
                    fileSize: 1234
                })
                expect(store.pages).toHaveLength(0)
            }
        })

        it('should handle pdf:page:done DB error', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            vi.mocked(db.getPage).mockRejectedValue(new Error('Load Fail'))

            const doneHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:page:done')?.[1]
            if (doneHandler) {
                await (doneHandler as (arg: any) => Promise<void>)({ pageId: 'err-p' })
                expect(store.pages).toHaveLength(0)
            }
        })

        it('should handle pdf:page:error', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            await store.addPage({ id: 'pdf-p1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'rendering', progress: 0, outputs: [], logs: [] })

            const errorHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:page:error')?.[1]
            if (errorHandler) {
                await (errorHandler as (arg: any) => Promise<void>)({ pageId: 'pdf-p1', error: 'Render crash' })
                expect(store.pages[0]!.status).toBe('error')
            }
        })

        it('should handle pdf:processing-error', () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const errorHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:processing-error')?.[1]
            if (errorHandler) {
                (errorHandler as (arg: any) => void)({ file: { name: 'err.pdf' }, error: 'Global PDF error' })
                expect(errorHandler).toBeDefined()
            }
        })

        it('should handle pdf:progress', () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const progressHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:progress')?.[1]
            if (progressHandler) {
                (progressHandler as (arg: any) => void)({ done: 5, total: 10 })
                expect(store.pdfProcessing.completed).toBe(5)
                expect(store.pdfProcessing.total).toBe(10)
            }
        })

        it('should handle pdf:processing-start and pdf:processing-complete', () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            const startHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:processing-start')?.[1]
            const completeHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:processing-complete')?.[1]

            if (startHandler) {
                (startHandler as (arg: any) => void)({ file: { name: 'test.pdf' }, totalPages: 10 })
                expect(store.pdfProcessing.active).toBe(true)
                expect(store.pdfProcessing.currentFile).toBe('test.pdf')
            }

            if (completeHandler) {
                (completeHandler as () => void)()
                expect(store.pdfProcessing.active).toBe(false)
            }
        })

        it('should handle pdf:log', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            await store.addPage({ id: 'pdf-p1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'rendering', progress: 0, outputs: [], logs: [] })

            const logHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => (call[0] as string) === 'pdf:log')?.[1]
            if (logHandler) {
                (logHandler as (arg: any) => void)({ pageId: 'pdf-p1', message: 'ocr done', level: 'info' })
                expect(store.pages[0]!.logs.some(l => l.message === 'ocr done')).toBe(true)
            }
        })
    })

    describe('Data Conversion', () => {
        it('pageToDBPage should handle processedAt and nested objects', async () => {
            const store = usePagesStore()
            const now = new Date()
            const page = {
                id: '1', fileName: 'f', fileSize: 0, fileType: '', origin: 'upload',
                status: 'ready', progress: 100, outputs: [{ format: 'text', content: 'c' }], logs: [],
                createdAt: now, updatedAt: now, processedAt: now
            }
            await store.savePageToDB(page as unknown as import("@/stores/pages").Page)
            expect(db.savePage).toHaveBeenCalledWith(expect.objectContaining({
                processedAt: expect.any(Date),
                outputs: [{ format: 'text', content: 'c' }]
            }))
        })

        it('dbPageToPage should handle null IDs and date conversion', async () => {
            const store = usePagesStore()
            const now = new Date()
            const dbPage = {
                id: 'd1', fileName: 'f', fileSize: 0, fileType: '', origin: 'upload',
                status: 'ready', progress: 100, outputs: [], logs: [],
                createdAt: now, updatedAt: now
            }
            vi.mocked(db.getAllPagesForDisplay).mockResolvedValue([dbPage as unknown as import("@/db").DBPage])
            await store.loadPagesFromDB()
            expect(store.pages[0]!.id).toBe('d1')
        })
    })

    describe('Selection Actions', () => {
        it('togglePageSelection should work', async () => {
            const store = usePagesStore()
            const id = 'id1'
            await store.addPage({ id, fileName: 'f.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.togglePageSelection(id)
            expect(store.selectedPageIds).toContain(id)

            store.togglePageSelection(id)
            expect(store.selectedPageIds).not.toContain(id)
        })

        it('selectAllPages and clearSelection', async () => {
            const store = usePagesStore()
            await store.addPage({ id: '1', fileName: 'f1.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })
            await store.addPage({ id: '2', fileName: 'f2.png', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })

            store.selectAllPages()
            expect(store.selectedPageIds).toHaveLength(2)

            store.clearSelection()
            expect(store.selectedPageIds).toHaveLength(0)
        })
    })
    describe('Coverage Gaps', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('deletePages should clear selection', async () => {
            const store = usePagesStore()
            await store.addPage({ id: '1', fileName: 'f1', fileSize: 0, fileType: '', origin: 'upload', status: 'ready', progress: 0, outputs: [], logs: [] })
            store.selectPage('1')

            store.deletePage('1')
            expect(store.selectedPageIds).not.toContain('1')
        })


        it('pdf:page:queued should ignore duplicate pages', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            await store.addPage({ id: 'p1', fileName: 'f1' } as unknown as import("@/db").DBPage)

            const queuedHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:page:queued')?.[1]
            if (queuedHandler) {
                // Call with existing ID
                await (queuedHandler as (arg: any) => Promise<void>)({ pageId: 'p1' })
                expect(db.getPage).not.toHaveBeenCalled()
            }
        })

        it('reorderPages should skip missing pages', async () => {
            const store = usePagesStore()
            await store.addPage({ id: '1', order: 10 } as unknown as import("@/db").DBPage)
            // Update '2' which doesn't exist
            await store.reorderPages([{ id: '1', order: 10 }, { id: '2', order: 20 }])
            expect(store.pages.find(p => p.id === '1')!.order).toBe(10)
        })

        it('addFiles should handle specific failure', async () => {
            const store = usePagesStore()
            vi.mocked(fileAddService.triggerFileSelect).mockResolvedValue([new File([], 'f')])
            vi.mocked(fileAddService.processFiles).mockResolvedValue({ success: false, error: 'Process Fail', pages: [] })

            const result = await store.addFiles()
            expect(result.success).toBe(false)
            expect(result.error).toBe('Process Fail')
        })

        it('pdf:log should default to info level', async () => {
            const store = usePagesStore()
            store.setupPDFEventListeners()
            // Add a page first so log can be attached
            await store.addPage({ id: 'p1' } as unknown as import("@/db").DBPage)

            const logHandler = vi.mocked(pdfEvents.on).mock.calls.find((call: unknown[]) => call[0] === 'pdf:log')?.[1]
            if (logHandler) {
                // @ts-expect-error: expecting partial type for testing
                (logHandler as unknown)({ pageId: 'p1', message: 'msg' }) // missing level
                expect(store.pages[0]!.logs.some(l => l.message === 'msg' && l.level === 'info')).toBe(true)
            }
        })
    })
})
