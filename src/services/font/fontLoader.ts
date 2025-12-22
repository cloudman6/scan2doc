/**
 * Font Loading and Management Service
 * Handles font loading, fallback, and caching for PDF rendering
 */

import { pdfLogger } from '@/services/logger'

export interface FontConfig {
  family: string
  source?: string
  format?: 'woff2' | 'woff' | 'ttf' | 'otf'
  weight?: string
  style?: string
}

export class FontLoaderService {
  private static instance: FontLoaderService
  private loadedFonts = new Set<string>()
  private fontCache = new Map<string, ArrayBuffer>()

  static getInstance(): FontLoaderService {
    if (!FontLoaderService.instance) {
      FontLoaderService.instance = new FontLoaderService()
    }
    return FontLoaderService.instance
  }

  /**
   * Load fallback fonts for CJK languages
   */
  async loadCJKFallbackFonts(): Promise<void> {
    const fallbackFonts: FontConfig[] = [
      // These are commonly available system fonts that support CJK characters
      { family: 'Noto Sans CJK SC', source: 'system' },
      { family: 'Noto Sans CJK TC', source: 'system' },
      { family: 'Noto Sans CJK JP', source: 'system' },
      { family: 'Noto Sans CJK KR', source: 'system' },
      { family: 'Source Han Sans SC', source: 'system' },
      { family: 'Source Han Sans TC', source: 'system' },
      { family: 'Microsoft YaHei', source: 'system' }, // Windows
      { family: 'SimHei', source: 'system' }, // Windows
      { family: 'PingFang SC', source: 'system' }, // macOS
      { family: 'Hiragino Sans GB', source: 'system' }, // macOS
      { family: 'Droid Sans Fallback', source: 'system' }, // Android
      { family: 'Roboto', source: 'system' }, // Android/iOS
      { family: 'Arial Unicode MS', source: 'system' }, // Cross-platform
    ]

    for (const font of fallbackFonts) {
      await this.loadFont(font)
    }
  }

  /**
   * Load a single font
   */
  async loadFont(config: FontConfig): Promise<boolean> {
    const key = `${config.family}:${config.weight || 'normal'}:${config.style || 'normal'}`

    if (this.loadedFonts.has(key)) {
      return true
    }

    try {
      if (config.source === 'system') {
        // For system fonts, we don't need to load them manually
        // PDF.js will use them if available
        this.loadedFonts.add(key)
        return true
      } else if (config.source) {
        // Load web fonts
        const fontFace = new FontFace(
          config.family,
          `url(${config.source})`,
          {
            weight: config.weight || 'normal',
            style: config.style || 'normal'
          }
        )

        await fontFace.load()
        document.fonts.add(fontFace)
        this.loadedFonts.add(key)
        return true
      }
    } catch (error) {
      pdfLogger.warn(`Failed to load font ${config.family}:`, error)
    }

    return false
  }

  /**
   * Check if a font is available
   */
  isFontAvailable(fontFamily: string): boolean {
    try {
      // Use a temporary canvas element to check font availability
      // Fallback to regular canvas if OffscreenCanvas is not available
      let canvas: HTMLCanvasElement | OffscreenCanvas
      let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(100, 100)
        context = canvas.getContext('2d')!
      } else {
        // Fallback to regular canvas
        canvas = document.createElement('canvas')
        canvas.width = 100
        canvas.height = 100
        context = canvas.getContext('2d')!
      }

      // Test with a character that should be different in different fonts
      const testChar = '中'

      context.font = `20px ${fontFamily}`
      const width1 = context.measureText(testChar).width

      context.font = '20px monospace'
      const width2 = context.measureText(testChar).width

      return width1 !== width2
    } catch (error) {
      pdfLogger.warn(`Font availability check failed for ${fontFamily}:`, error)
      // Assume font is not available if check fails
      return false
    }
  }

  /**
   * Get best available font for text
   */
  getBestFont(text: string): string {
    // Detect if text contains CJK characters
    const hasCJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/.test(text)

    if (hasCJK) {
      // Try CJK fonts in order of preference
      const cjkFonts = [
        'PingFang SC', // macOS
        'Hiragino Sans GB', // macOS
        'Microsoft YaHei', // Windows
        'SimHei', // Windows
        'Noto Sans CJK SC',
        'Source Han Sans SC',
        'Droid Sans Fallback', // Android
        'Roboto', // Android/iOS
        'Arial Unicode MS', // Cross-platform fallback
        'sans-serif' // Ultimate fallback
      ]

      for (const font of cjkFonts) {
        if (this.isFontAvailable(font)) {
          return font
        }
      }
    }

    // For non-CJK text, use standard web fonts
    const standardFonts = [
      'Helvetica',
      'Arial',
      'Roboto',
      'system-ui',
      'sans-serif'
    ]

    for (const font of standardFonts) {
      if (this.isFontAvailable(font)) {
        return font
      }
    }

    return 'sans-serif'
  }

  /**
   * Preload common fonts
   */
  async preloadCommonFonts(): Promise<void> {
    await this.loadCJKFallbackFonts()
  }
}

// Export singleton instance
export const fontLoader = FontLoaderService.getInstance()