import * as pdfjsLib from 'pdfjs-dist'
import { queuePDFPages, resumePDFProcessing } from './pdfQueue'
import { pdfEvents } from './events'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Configure PDF.js worker (for main thread usage)
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface PDFPageInfo {
  pageNumber: number
  width: number
  height: number
  imageData?: string  // base64 image data
  thumbnailData?: string  // base64 thumbnail data
}

export interface PDFProcessingOptions {
  dpi?: number
  thumbnailSize?: number
  imageFormat?: 'png' | 'jpeg'
  quality?: number
  scale?: number
}

export interface PDFDocument {
  file: File
  data: ArrayBuffer
  base64Data: string // 纯 base64 数据（不含 data: 前缀）
  pageCount: number
  pages: PDFPageInfo[]
  metadata?: {
    title?: string
    author?: string
    subject?: string
    creator?: string
    producer?: string
    creationDate?: any
    modificationDate?: any
  }
}

export class PDFService {
  private loadedPDFs = new Map<string, PDFDocument>()

  /**
   * 辅助方法：将 File 转换为纯 base64 字符串（不含 data: 前缀）
   */
  private async fileToPureBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // 提取纯 base64 数据，处理极端情况
        const base64 = result.split(',')[1] || ''
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * 辅助方法：将纯 base64 字符串转换为 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const len = binaryString.length
    const uint8Array = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      uint8Array[i] = binaryString.charCodeAt(i)
    }
    return uint8Array.buffer
  }

  /**
   * Load PDF document and extract metadata
   */
  async loadPDF(file: File): Promise<PDFDocument> {
    try {
      // 1. 验证文件（增强验证逻辑）
      const validateResult = this.validatePDF(file)
      if (!validateResult.valid) {
        throw new Error(validateResult.error!)
      }

      // 2. 转换为纯 base64（作为可靠的中间载体）
      const base64Data = await this.fileToPureBase64(file)
      // 3. 从 base64 转换为 ArrayBuffer（避免直接依赖 file.arrayBuffer() 的分离问题）
      const arrayBuffer = this.base64ToArrayBuffer(base64Data)
      const uint8Array = new Uint8Array(arrayBuffer)

      // 4. 获取本地 pdfjs-dist 版本，匹配 CDN 地址（避免版本不一致）
      // 可通过 npm list pdfjs-dist 查看版本，这里示例用 5.4.449，需根据实际版本修改
      const pdfJsVersion = '5.4.449'
      // 5. 使用 Uint8Array 加载 PDF（配置 CMAP 解决中文显示）
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVersion}/cmaps/`,
        cMapPacked: true,
        // 省略 standardFontDataUrl（中文场景可移除，减少依赖）
        maxMemory: 1024 * 1024 * 512, // 512MB
      })

      const pdfDocument = await loadingTask.promise
      const pageCount = pdfDocument.numPages

      // 6. 读取 PDF 元数据
      const metadata = await pdfDocument.getMetadata()

      // 7. 提取页面信息
      const pages: PDFPageInfo[] = []
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdfDocument.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1.0 })

        pages.push({
          pageNumber: pageNum,
          width: viewport.width,
          height: viewport.height
        })

        // 释放页面资源（优化内存）
        page.cleanup()
      }

      // 8. 构建 PDFDocument 对象（使用 base64 转换的 ArrayBuffer，避免分离）
      const pdfDoc: PDFDocument = {
        file,
        data: arrayBuffer,
        base64Data, // 保存纯 base64 数据
        pageCount,
        pages,
        metadata: {
          title: metadata.info?.Title,
          author: metadata.info?.Author,
          subject: metadata.info?.Subject,
          creator: metadata.info?.Creator,
          producer: metadata.info?.Producer,
          creationDate: metadata.info?.CreationDate,
          modificationDate: metadata.info?.ModDate
        }
      }

      // 缓存 PDF
      const cacheKey = `${file.name}_${file.size}_${file.lastModified}`
      this.loadedPDFs.set(cacheKey, pdfDoc)

      return pdfDoc

    } catch (error) {
      console.error('Error loading PDF:', error)
      throw new Error(`Failed to load PDF "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get page count from loaded PDF document
   */
  getPageCount(pdfDocument: PDFDocument): number {
    return pdfDocument.pageCount
  }

  /**
   * Get page information
   */
  getPageInfo(pdfDocument: PDFDocument, pageNumber: number): PDFPageInfo | undefined {
    return pdfDocument.pages.find(p => p.pageNumber === pageNumber)
  }

  /**
   * Process PDF file and queue all pages for rendering
   */
  async processPDF(file: File): Promise<void> {
    try {
      // Load PDF document
      const pdfDocument = await this.loadPDF(file)

      // Emit processing start event
      pdfEvents.emit('pdf:log', {
        pageId: `pdf_${file.name}_${Date.now()}`,
        message: `Starting to process PDF "${file.name}" with ${pdfDocument.pageCount} pages`,
        level: 'info'
      })

      // 修复：从 base64 重新创建 ArrayBuffer，避免使用已分离的原缓冲区
      // 替代原来的 slice(0) 操作
      const pdfDataCopy = this.base64ToArrayBuffer(pdfDocument.base64Data)

      // Queue all pages for rendering
      await queuePDFPages(file, pdfDataCopy, pdfDocument.pageCount)

    } catch (error) {
      console.error('Error processing PDF:', error)

      // Emit error event
      pdfEvents.emit('pdf:processing-error', {
        file,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      })
    }
  }

  /**
   * Generate thumbnail for a PDF page (synchronous version using canvas)
   */
  async generateThumbnail(
    pdfData: ArrayBuffer,
    pageNumber: number,
    size: number = 200
  ): Promise<string> {
    try {
      // Load PDF document（添加 CMAP 配置，避免缩略图中文乱码）
      const pdfJsVersion = '5.4.449'
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfData),
        cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVersion}/cmaps/`,
        cMapPacked: true,
      })
      const pdfDocument = await loadingTask.promise

      // Get page
      const page = await pdfDocument.getPage(pageNumber)

      // Calculate scale to fit within size
      const viewport = page.getViewport({ scale: 1.0 })
      const scale = Math.min(size / viewport.width, size / viewport.height)

      // Create canvas
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!

      // Set canvas dimensions
      const thumbViewport = page.getViewport({ scale })
      canvas.width = thumbViewport.width
      canvas.height = thumbViewport.height

      // Render page to canvas
      await page.render({
        canvasContext: context,
        viewport: thumbViewport
      }).promise

      // Convert to base64
      return canvas.toDataURL('image/jpeg', 0.8)

    } catch (error) {
      console.error('Error generating thumbnail:', error)
      throw error
    }
  }

  /**
   * Resume processing of any interrupted PDF pages
   */
  async resumeProcessing(): Promise<void> {
    await resumePDFProcessing()
  }

  /**
   * Get cached PDF document
   */
  getCachedPDF(file: File): PDFDocument | undefined {
    const cacheKey = `${file.name}_${file.size}_${file.lastModified}`
    return this.loadedPDFs.get(cacheKey)
  }

  /**
   * Clear PDF cache
   */
  clearCache(): void {
    this.loadedPDFs.clear()
  }

  /**
   * Validate PDF file
   */
  validatePDF(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return {
        valid: false,
        error: '请选择一个文件！'
      }
    }

    // 增强：忽略大小写判断文件后缀
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      return {
        valid: false,
        error: `请选择有效的 PDF 文件！当前文件类型: ${file.type || '未知'}`
      }
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: `文件 "${file.name}" 为空`
      }
    }

    // 检查文件大小限制 (100MB)
    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `文件 "${file.name}" 过大，最大支持 ${Math.round(maxSize / 1024 / 1024)}MB`
      }
    }

    return { valid: true }
  }

  /**
   * Get PDF metadata without loading full document（优化：复用 loadPDF 的逻辑，减少冗余）
   */
  async getPDFMetadata(file: File): Promise<{ pageCount?: number; title?: string; author?: string; subject?: string }> {
    try {
      // 复用 loadPDF 方法，避免重复的 base64 转换和 PDF 加载逻辑
      const pdfDocument = await this.loadPDF(file)
      return {
        pageCount: pdfDocument.pageCount,
        title: pdfDocument.metadata?.title,
        author: pdfDocument.metadata?.author,
        subject: pdfDocument.metadata?.subject
      }

    } catch (error) {
      console.error('Error getting PDF metadata:', error)
      return {}
    }
  }
}

// Export singleton instance
export const pdfService = new PDFService()