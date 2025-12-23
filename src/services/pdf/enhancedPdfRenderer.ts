/**
 * Enhanced PDF Renderer with Font Support
 * Provides advanced font handling and rendering capabilities
 */

import * as pdfjsLib from 'pdfjs-dist'
import { CMAP_URL, CMAP_PACKED } from './config'
import { fontLoader } from '../font/fontLoader'
import { pdfLogger } from '@/services/logger'

export interface EnhancedRenderOptions {
  scale?: number
  imageFormat?: 'png' | 'jpeg'
  quality?: number
  useEnhancedFonts?: boolean
  fallbackFontFamily?: string
  sourceId?: string // Optional ID for document caching
}

export class EnhancedPdfRenderer {
  private static instance: EnhancedPdfRenderer
  private documentCache = new Map<string, pdfjsLib.PDFDocumentProxy>()

  static getInstance(): EnhancedPdfRenderer {
    if (!EnhancedPdfRenderer.instance) {
      EnhancedPdfRenderer.instance = new EnhancedPdfRenderer()
    }
    return EnhancedPdfRenderer.instance
  }

  /**
   * Initialize the enhanced renderer
   */
  async initialize(): Promise<void> {
    try {
      // Preload common fonts
      await fontLoader.preloadCommonFonts()
      pdfLogger.info('[Enhanced PDF Renderer] Font initialization completed')
    } catch (error) {
      pdfLogger.warn('[Enhanced PDF Renderer] Font initialization failed:', error)
    }
  }

  /**
   * Get or load a PDF document
   */
  private async getDocument(pdfData: ArrayBuffer, sourceId?: string): Promise<pdfjsLib.PDFDocumentProxy> {
    // If we have a sourceId and it's in cache, return it
    if (sourceId && this.documentCache.has(sourceId)) {
      return this.documentCache.get(sourceId)!
    }

    // Load PDF document with enhanced configuration
    const uint8Array = new Uint8Array(pdfData)
    const loadingTask = pdfjsLib.getDocument({
      data: uint8Array,
      cMapUrl: CMAP_URL,
      cMapPacked: CMAP_PACKED,
      useSystemFonts: true,
      fontExtraProperties: true,
      verbosity: 0
    })

    const pdfDocument = await loadingTask.promise

    // Cache if sourceId is provided
    if (sourceId) {
      this.documentCache.set(sourceId, pdfDocument)
    }

    return pdfDocument
  }

  /**
   * Explicitly destroy a cached document
   */
  async destroyDocument(sourceId: string): Promise<void> {
    const doc = this.documentCache.get(sourceId)
    if (doc) {
      try {
        await doc.destroy()
        this.documentCache.delete(sourceId)
        pdfLogger.info(`[Enhanced PDF Renderer] Destroyed document handle for: ${sourceId}`)
      } catch (error) {
        pdfLogger.warn(`[Enhanced PDF Renderer] Error destroying document ${sourceId}:`, error)
      }
    }
  }

  /**
   * Render PDF page with enhanced font support
   */
  async renderPage(
    pdfData: ArrayBuffer,
    pageNumber: number,
    options: EnhancedRenderOptions = {}
  ): Promise<{ imageBlob: Blob; width: number; height: number; fileSize: number }> {
    const {
      scale = 2.5,
      imageFormat = 'png',
      quality = 0.95,
      useEnhancedFonts = true,
      fallbackFontFamily,
      sourceId
    } = options

    let pdfDocument: pdfjsLib.PDFDocumentProxy | null = null

    try {
      // Use cached document or load new one
      pdfDocument = await this.getDocument(pdfData, sourceId)

      // Get page
      const page = await pdfDocument.getPage(pageNumber)
      const viewport = page.getViewport({ scale })

      // Create canvas with enhanced settings
      const canvas = new OffscreenCanvas(viewport.width, viewport.height)
      const context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false
      })!

      // Enhanced canvas settings
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.textRenderingOptimization = 'optimizeQuality'

      // Apply font fallback if needed
      if (useEnhancedFonts && fallbackFontFamily) {
        context.font = `${16 * scale}px ${fallbackFontFamily}`
      }

      // Render with enhanced settings
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        intent: 'print' as const,
        renderInteractiveForms: true
      }

      await page.render(renderContext).promise

      // Convert to image Blob
      const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      const imageBlob = await canvas.convertToBlob({
        type: mimeType,
        quality: imageFormat === 'jpeg' ? quality : undefined
      })

      // Clean up page resources
      page.cleanup()

      // IMPORTANT: If we are NOT using cache (no sourceId), destroy document immediately
      if (!sourceId && pdfDocument) {
        await pdfDocument.destroy()
      }

      return {
        imageBlob,
        width: viewport.width,
        height: viewport.height,
        fileSize: imageBlob.size
      }

    } catch (error) {
      pdfLogger.error('[Enhanced PDF Renderer] Render failed:', error)
      // Attempt cleanup on error if not using cache
      if (!sourceId && pdfDocument) {
        try { await pdfDocument.destroy() } catch (e) { }
      }
      throw error
    }
  }

  /**
   * Analyze PDF font usage
   */
  async analyzeFonts(pdfData: ArrayBuffer): Promise<string[]> {
    try {
      const uint8Array = new Uint8Array(pdfData)
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        useSystemFonts: true,
        fontExtraProperties: true
      })

      const pdfDocument = await loadingTask.promise
      const fontNames: string[] = []

      // Analyze first few pages to determine font usage
      const numPages = Math.min(pdfDocument.numPages, 3)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum)
          const textContent = await page.getTextContent()

          textContent.items.forEach((item: any) => {
            if (item.fontName) {
              fontNames.push(item.fontName)
            }
          })

          page.cleanup()
        } catch (pageError) {
          pdfLogger.warn(`Failed to analyze page ${pageNum}:`, pageError)
        }
      }

      return [...new Set(fontNames)] // Remove duplicates

    } catch (error) {
      pdfLogger.error('[Enhanced PDF Renderer] Font analysis failed:', error)
      return []
    }
  }

  /**
   * Get optimal fallback font for this PDF
   */
  async getOptimalFallbackFont(pdfData: ArrayBuffer): Promise<string> {
    try {
      // Create a safe copy of the ArrayBuffer to avoid detachment issues
      const pdfDataCopy = pdfData.slice(0)
      const textContent = await this.extractTextContent(pdfDataCopy)
      return fontLoader.getBestFont(textContent)
    } catch (error) {
      pdfLogger.warn('[Enhanced PDF Renderer] Could not determine optimal font:', error)
      return 'sans-serif'
    }
  }

  /**
   * Extract text content for font analysis
   */
  private async extractTextContent(pdfData: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(pdfData)
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        cMapUrl: CMAP_URL,
        cMapPacked: CMAP_PACKED,
        useSystemFonts: true
      })

      const pdfDocument = await loadingTask.promise
      let allText = ''

      // Extract text from first few pages
      const numPages = Math.min(pdfDocument.numPages, 3)

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          const page = await pdfDocument.getPage(pageNum)
          const textContent = await page.getTextContent()

          textContent.items.forEach((item: any) => {
            if (item.str) {
              allText += item.str + ' '
            }
          })

          page.cleanup()
        } catch (pageError) {
          pdfLogger.warn(`Failed to extract text from page ${pageNum}:`, pageError)
        }
      }

      return allText

    } catch (error) {
      pdfLogger.error('[Enhanced PDF Renderer] Text extraction failed:', error)
      return ''
    }
  }

  /**
   * Convert blob to base64
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  }
}

// Export singleton instance
export const enhancedPdfRenderer = EnhancedPdfRenderer.getInstance()