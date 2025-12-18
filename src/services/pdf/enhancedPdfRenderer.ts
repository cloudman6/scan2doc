/**
 * Enhanced PDF Renderer with Font Support
 * Provides advanced font handling and rendering capabilities
 */

import * as pdfjsLib from 'pdfjs-dist'
import { fontLoader } from '../font/fontLoader'

export interface EnhancedRenderOptions {
  scale?: number
  imageFormat?: 'png' | 'jpeg'
  quality?: number
  useEnhancedFonts?: boolean
  fallbackFontFamily?: string
}

export class EnhancedPdfRenderer {
  private static instance: EnhancedPdfRenderer

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
      console.log('[Enhanced PDF Renderer] Font initialization completed')
    } catch (error) {
      console.warn('[Enhanced PDF Renderer] Font initialization failed:', error)
    }
  }

  /**
   * Render PDF page with enhanced font support
   */
  async renderPage(
    pdfData: ArrayBuffer,
    pageNumber: number,
    options: EnhancedRenderOptions = {}
  ): Promise<{ imageData: string; width: number; height: number }> {
    const {
      scale = 2.5,
      imageFormat = 'png',
      quality = 0.95,
      useEnhancedFonts = true,
      fallbackFontFamily
    } = options

    try {
      // Create a safe copy of the ArrayBuffer to avoid detachment issues
      const pdfDataCopy = pdfData.slice(0)
      const uint8Array = new Uint8Array(pdfDataCopy)

      // Load PDF document with enhanced configuration
      const loadingTask = pdfjsLib.getDocument({
        data: uint8Array,
        // Enhanced font configuration
        useSystemFonts: true,
        fontExtraProperties: true,
        enhanceTextSelection: true,
        // Suppress warnings
        verbosity: useEnhancedFonts ? 0 : 1
      })

      const pdfDocument = await loadingTask.promise

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

      // Convert to image
      const mimeType = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      const blob = await canvas.convertToBlob({
        type: mimeType,
        quality: imageFormat === 'jpeg' ? quality : undefined
      })

      const imageData = await this.blobToBase64(blob)

      // Clean up
      page.cleanup()

      return {
        imageData,
        width: viewport.width,
        height: viewport.height
      }

    } catch (error) {
      console.error('[Enhanced PDF Renderer] Render failed:', error)
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
          console.warn(`Failed to analyze page ${pageNum}:`, pageError)
        }
      }

      return [...new Set(fontNames)] // Remove duplicates

    } catch (error) {
      console.error('[Enhanced PDF Renderer] Font analysis failed:', error)
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
      console.warn('[Enhanced PDF Renderer] Could not determine optimal font:', error)
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
          console.warn(`Failed to extract text from page ${pageNum}:`, pageError)
        }
      }

      return allText

    } catch (error) {
      console.error('[Enhanced PDF Renderer] Text extraction failed:', error)
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