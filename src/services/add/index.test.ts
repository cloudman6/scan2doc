import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fileAddService } from './index'
import { pdfService } from '@/services/pdf'
import { db } from '@/db/index'

// 1. Mock external dependencies
vi.mock('@/services/pdf', () => ({
    pdfService: {
        validatePDF: vi.fn(),
        getPDFMetadata: vi.fn(),
        processPDF: vi.fn()
    }
}))

// Mock database
vi.mock('@/db/index', () => ({
    db: {
        savePageImage: vi.fn()
    },
    generatePageId: vi.fn(() => 'mock-page-id')
}))

describe('FileAddService', () => {
    beforeEach(() => {
        vi.resetAllMocks()

        // Setup default mock implementations
        vi.mocked(pdfService.validatePDF).mockReturnValue({ valid: true })
        vi.mocked(pdfService.getPDFMetadata).mockResolvedValue({ pageCount: 2 })
        vi.mocked(pdfService.processPDF).mockResolvedValue(undefined as any)
        vi.mocked(db.savePageImage).mockResolvedValue(undefined as any)

        // Reset URL.createObjectURL
        window.URL.createObjectURL = vi.fn((file: any) => `mock-url-${file?.name || 'unknown'}`)
    })

    describe('File validation', () => {
        it('should recognize and handle PDF files', async () => {
            const mockFile = new File(['fake content'], 'test.pdf', { type: 'application/pdf' })
            const result = await fileAddService.processFiles([mockFile])

            expect(result.error).toBeUndefined()
            expect(result.pages).toEqual([])

            const { pdfService } = await import('@/services/pdf')
            expect(pdfService.processPDF).toHaveBeenCalledWith(mockFile)
        })

        it('Validation: should throw error if image exceeds 10MB', async () => {
            const largeImg = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.png', { type: 'image/png' })
            const result = await fileAddService.processFiles([largeImg])

            expect(result.success).toBe(false)
            expect(result.error).toContain('is too large')
        })

        it('Validation: PDF allowed up to 100MB', async () => {
            const midPdf = new File([new ArrayBuffer(50 * 1024 * 1024)], 'mid.pdf', { type: 'application/pdf' })
            const result = await fileAddService.processFiles([midPdf])
            expect(result.error).toBeUndefined()
        })

        it('Validation: should throw error if PDF exceeds 100MB', async () => {
            const hugePdf = new File([new ArrayBuffer(101 * 1024 * 1024)], 'huge.pdf', { type: 'application/pdf' })
            const result = await fileAddService.processFiles([hugePdf])

            expect(result.success).toBe(false)
            expect(result.error).toContain('is too large')
        })

        it('Validation: should throw error if file type is unsupported', async () => {
            const badFile = new File([''], 'virus.exe', { type: 'application/x-msdownload' })
            const result = await fileAddService.processFiles([badFile])

            expect(result.success).toBe(false)
            expect(result.error).toContain('unsupported type')
        })

        it('Validation: should return unsuccessful for empty file list', async () => {
            const result = await fileAddService.processFiles([])
            expect(result.success).toBe(false)
            expect(result.pages).toHaveLength(0)
        })

        it('Validation: should be able to override default configuration', async () => {
            // Default limit is 10MB, we override it to 1KB
            const smallImg = new File([new ArrayBuffer(2048)], 'small.png', { type: 'image/png' })
            const result = await fileAddService.processFiles([smallImg], { maxFileSize: 1024 })

            expect(result.success).toBe(false)
            expect(result.error).toContain('is too large')
        })
    })

    describe('Image processing', () => {
        beforeEach(() => {
            // Setup global mocks for browser APIs used in private methods
            (window as any).Image = class {
                onload: any = null
                onerror: any = null
                _src: string = ''
                width: number = 100
                height: number = 100
                set src(s: string) {
                    this._src = s
                    setTimeout(() => {
                        if (s && s.includes('fail')) {
                            if (this.onerror) this.onerror()
                        } else {
                            if (this.onload) this.onload()
                        }
                    }, 0)
                }
                get src() { return this._src }
            };

            // Mock FileReader
            (window as any).FileReader = class {
                onload: any = null
                onerror: any = null
                result: any = null
                readAsDataURL(file: File) {
                    setTimeout(() => {
                        if (file.name === 'fail.png') {
                            if (this.onerror) this.onerror()
                        } else {
                            this.result = `data:${file.type};base64,mocked_base64`
                            if (this.onload) this.onload()
                        }
                    }, 0)
                }
            };

            // Mock Canvas
            const mockCanvas = {
                getContext: () => ({
                    drawImage: vi.fn()
                }),
                toDataURL: () => 'data:image/jpeg;base64,mock_thumb',
                width: 0,
                height: 0
            }
            vi.spyOn(document, 'createElement').mockImplementation((tag) => {
                if (tag === 'canvas') return mockCanvas as any
                if (tag === 'input') return { type: '', accept: '', multiple: false, click: vi.fn(), onchange: null } as any
                return {} as any
            })
        })

        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('should process images using real implementation of private methods', async () => {
            const mockImg = new File([''], 'photo.jpg', { type: 'image/jpeg' })
            const result = await fileAddService.processFiles([mockImg])

            expect(result.pages.length).toBe(1)
            expect(result.pages[0]?.thumbnailData).toBe('data:image/jpeg;base64,mock_thumb')
            expect(result.pages[0]!.width).toBe(100)
            expect(result.pages[0]!.height).toBe(100)
        })

        it('corrupted images should be skipped and throw error', async () => {
            const mockImg = new File([''], 'fail.jpg', { type: 'image/jpeg' })

            const result = await fileAddService.processFiles([mockImg])

            expect(result.pages).toHaveLength(0)
            expect(result.error).toContain('Failed to load image')
            expect(result.success).toBe(false)
        })

        it('if thumbnails are disabled, should use base64 fallback', async () => {
            const mockImg = new File([''], 'photo.jpg', { type: 'image/jpeg' })
            const result = await fileAddService.processFiles([mockImg], { generateThumbnails: false })

            expect(result.pages[0]?.thumbnailData).toBe('data:image/jpeg;base64,mocked_base64')
        })

        it('if thumbnail generation fails, should fall back to base64', async () => {
            // Force thumbnail generation failure by making canvas creation fail or image loading for thumb fail
            // Here we can just mock generateThumbnail once to test the fallback logic in processImageFile
            const spyThumb = vi.spyOn(fileAddService as any, 'generateThumbnail').mockRejectedValue(new Error('Thumb failed'))

            const mockImg = new File([''], 'photo.jpg', { type: 'image/jpeg' })
            const result = await fileAddService.processFiles([mockImg])

            expect(result.pages[0]?.thumbnailData).toBe('data:image/jpeg;base64,mocked_base64')
            spyThumb.mockRestore()
        })

        it('fileToBase64 failure branch', async () => {
            // Mock getImageDimensions to succeed so we can reach fileToBase64
            vi.spyOn(fileAddService as any, 'getImageDimensions').mockResolvedValue({ width: 100, height: 100 })
            // Mock fileToBase64 to fail
            vi.spyOn(fileAddService as any, 'fileToBase64').mockRejectedValue(new Error('Failed to read file'))

            const mockImg = new File(['fake data'], 'fail.png', { type: 'image/png' })
            const result = await fileAddService.processFiles([mockImg], { generateThumbnails: false })

            expect(result.success).toBe(false)
            expect(result.error).toMatch(/Failed to read file/)
        })

        it('fileToBase64 non-string result branch', async () => {
            // Mock getImageDimensions to succeed
            vi.spyOn(fileAddService as any, 'getImageDimensions').mockResolvedValue({ width: 100, height: 100 })

            function MockFileReader(this: any) {
                this.readAsDataURL = function () {
                    setTimeout(() => {
                        this.result = new ArrayBuffer(0) // Non-string result
                        if (this.onload) this.onload()
                    }, 0)
                }
                this.onload = null
                this.onerror = null
                this.result = null
            }
            vi.stubGlobal('FileReader', MockFileReader)

            const mockImg = new File(['fake data'], 'fail.png', { type: 'image/png' })
            const result = await fileAddService.processFiles([mockImg], { generateThumbnails: false })

            expect(result.success).toBe(false)
            expect(result.error).toMatch(/Failed to convert file to base64/)

            vi.unstubAllGlobals()
        })

        it('DB save failure should not interrupt the process', async () => {
            const { db } = await import('@/db/index')
            vi.mocked(db.savePageImage).mockRejectedValue(new Error('DB error'))

            const mockImg = new File(['fake data'], 'photo.jpg', { type: 'image/jpeg' })
            const result = await fileAddService.processFiles([mockImg])

            expect(result.pages.length).toBe(1)
            expect(result.pages[0]?.id).toBe('mock-page-id')
        })
    })

    describe('PDF processing error', () => {
        it('should throw error when validation fails', async () => {
            const { pdfService } = await import('@/services/pdf')
            vi.mocked(pdfService.validatePDF).mockReturnValue({ valid: false, error: 'Invalid PDF structure' })

            const mockFile = new File([''], 'bad.pdf', { type: 'application/pdf' })
            const result = await fileAddService.processFiles([mockFile])

            expect(result.success).toBe(false)
            expect(result.error).toContain('Invalid PDF structure')
        })

        it('should throw error when page count is 0', async () => {
            const { pdfService } = await import('@/services/pdf')
            vi.mocked(pdfService.getPDFMetadata).mockResolvedValue({ pageCount: 0 })

            const mockFile = new File([''], 'empty.pdf', { type: 'application/pdf' })
            const result = await fileAddService.processFiles([mockFile])

            expect(result.success).toBe(false)
            expect(result.error).toMatch(/empty or corrupted/)
        })
    })

    describe('Mixed processing', () => {
        it('when partially successful and partially failed, success should be false', async () => {
            // Mock what's needed for the image to succeed
            vi.spyOn(fileAddService as any, 'generateThumbnail').mockResolvedValue('data:mock_thumb')
            vi.spyOn(fileAddService as any, 'fileToBase64').mockResolvedValue('data:mock_full')
            vi.spyOn(fileAddService as any, 'getImageDimensions').mockResolvedValue({ width: 100, height: 100 })

            const validImg = new File([''], 'ok.png', { type: 'image/png' })
            const invalidFile = new File([''], 'bad.txt', { type: 'text/plain' })

            const result = await fileAddService.processFiles([validImg, invalidFile])

            expect(result.pages).toHaveLength(1)
            expect(result.success).toBe(false)
            expect(result.error).toBeDefined()
        })

        it('should hit the unsupported file branch if validation is bypassed or allowedTypes includes it', async () => {
            const txtFile = new File([''], 'test.txt', { type: 'text/plain' })
            // Pass allowedTypes to pass validation but it's not handled in the if/else logic
            const result = await fileAddService.processFiles([txtFile], { allowedTypes: ['text/plain'] })

            expect(result.success).toBe(false)
            expect(result.error).toMatch(/Skipping unsupported file/)
        })
    })

    describe('Calculation logic: calculateDimensions', () => {
        it('should correctly perform proportional scaling', () => {
            const calc = (fileAddService as any).calculateDimensions

            // Landscape image scaled to small area
            const res1 = calc(1000, 500, 200, 300)
            expect(res1).toEqual({ width: 200, height: 100 })

            // Portrait image scaled to small area
            const res2 = calc(500, 1000, 200, 300)
            expect(res2).toEqual({ width: 150, height: 300 })

            // Images smaller than target area should not be scaled up (ratio not exceeding 1)
            const res3 = calc(100, 100, 200, 300)
            expect(res3).toEqual({ width: 100, height: 100 })
        })
    })

    describe('UI interaction: triggerFileSelect', () => {
        it('should trigger file selection and return file list', async () => {
            const mockFiles = [new File([''], 'test.png', { type: 'image/png' })]

            // Mock document.createElement
            const mockInput = {
                click: vi.fn(),
                type: '',
                accept: '',
                multiple: false,
                files: mockFiles,
                onchange: null as any
            }
            vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any)

            const promise = fileAddService.triggerFileSelect()

            // Simulate user selecting files
            if (mockInput.onchange) mockInput.onchange({} as any)

            const result = await promise
            expect(result).toEqual(mockFiles)
            expect(mockInput.type).toBe('file')
            expect(mockInput.multiple).toBe(true)
        })

        it('should support single selection mode', async () => {
            const mockInput = {
                click: vi.fn(),
                onchange: null as any
            }
            vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any)

            fileAddService.triggerFileSelect(false)
            expect((mockInput as any).multiple).toBe(false)
        })

        it('should return empty array when selection is cancelled', async () => {
            const mockInput = {
                click: vi.fn(),
                oncancel: null as any
            }
            vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any)

            const promise = fileAddService.triggerFileSelect()
            if (mockInput.oncancel) mockInput.oncancel()

            const result = await promise
            expect(result).toEqual([])
        })

        it('should reject when file selection fails', async () => {
            const mockInput = {
                click: vi.fn(),
                onerror: null as any
            }
            vi.spyOn(document, 'createElement').mockReturnValue(mockInput as any)

            const promise = fileAddService.triggerFileSelect()
            if (mockInput.onerror) mockInput.onerror()

            await expect(promise).rejects.toThrow('File selection failed')
        })
    })
})

