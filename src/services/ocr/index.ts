// OCR Service - Placeholder implementation
// This service will handle text extraction from images using various OCR providers

import { DeepSeekOCRProvider } from './providers'
export interface OCRBox {
  label: 'title' | 'image' | 'table' | 'text' | string
  box: [number, number, number, number] // [x1, y1, x2, y2]
}

export interface OCRResult {
  success: boolean
  text: string
  raw_text: string
  boxes: OCRBox[]
  image_dims: { w: number; h: number }
  prompt_type: string
}

export type OCRPromptType = 'document' | 'ocr' | 'free' | 'figure' | 'describe' | 'find' | 'freeform'

export interface OCROptions {
  prompt_type?: OCRPromptType
  custom_prompt?: string // used for freeform
  find_term?: string     // used for find
  grounding?: boolean    // required for all
  signal?: AbortSignal
}

export interface OCRProvider {
  name: string
  process(imageData: Blob | string, options?: OCROptions): Promise<OCRResult>
}

import { db } from '@/db'
import { ocrEvents } from './events'
import { queueManager } from '@/services/queue'

export class OCRService {
  private providers: Map<string, OCRProvider> = new Map()

  constructor() {
    this.registerProvider('deepseek', new DeepSeekOCRProvider())
  }

  registerProvider(name: string, provider: OCRProvider) {
    this.providers.set(name, provider)
  }

  /**
   * Queue an OCR task for a page
   */
  async queueOCR(
    pageId: string,
    imageData: Blob | string,
    options?: OCROptions
  ): Promise<void> {
    ocrEvents.emit('ocr:queued', { pageId })

    // Fire and forget - processing happens in queue
    queueManager.addOCRTask(pageId, async (signal) => {
      // Check for abort before starting (QueueManager also checks, but good practice)
      if (signal.aborted) return

      ocrEvents.emit('ocr:start', { pageId })

      try {
        // Run OCR
        // Note: We now pass the signal to processImage -> provider -> fetch for native cancellation.
        const result = await this.processImage(imageData, 'deepseek', { ...options, signal })

        if (signal.aborted) return // Check again after result

        // Save to DB
        await db.savePageOCR({
          pageId,
          data: result,
          createdAt: new Date()
        })

        ocrEvents.emit('ocr:success', { pageId, result })
      } catch (error) {
        if (signal.aborted) return // Ignore error if aborted

        const err = error instanceof Error ? error : new Error(String(error))
        ocrEvents.emit('ocr:error', { pageId, error: err })
        throw err
      }
    }).catch(err => {
      // Log errors that happened in adding to queue or unhandled rejections
      console.error(`[OCRService] Task error for ${pageId}:`, err)
    })
  }

  async processImage(
    imageData: Blob | string,
    providerName: string = 'deepseek',
    options?: OCROptions
  ): Promise<OCRResult> {
    const provider = this.providers.get(providerName)
    if (!provider) {
      throw new Error(`OCR provider '${providerName}' not found`)
    }

    return await provider.process(imageData, options)
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
  }
}

export const ocrService = new OCRService()