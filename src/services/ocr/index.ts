// OCR Service - Placeholder implementation
// This service will handle text extraction from images using various OCR providers

export interface OCRProvider {
  name: string
  process(imageData: string, options?: OCROptions): Promise<OCRResult>
}

export interface OCROptions {
  language?: string
  confidence?: number
  preprocess?: boolean
}

export interface OCRResult {
  text: string
  confidence: number
  words?: OCRWord[]
  lines?: OCRLine[]
  processingTime?: number
}

export interface OCRWord {
  text: string
  confidence: number
  boundingBox: BoundingBox
}

export interface OCRLine {
  text: string
  confidence: number
  words: OCRWord[]
  boundingBox: BoundingBox
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export class OCRService {
  private providers: Map<string, OCRProvider> = new Map()

  constructor() {
    // Register OCR providers - to be implemented
    // this.registerProvider('tesseract', new TesseractProvider())
    // this.registerProvider('vision-ai', new VisionAIProvider())
  }

  registerProvider(name: string, provider: OCRProvider) {
    this.providers.set(name, provider)
  }

  async processImage(
    imageData: string,
    providerName: string = 'tesseract',
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