import type { Page } from '@/stores/pages'

export interface FileAddResult {
  success: boolean
  pages: Page[]
  error?: string
}

export interface FileProcessingOptions {
  maxFileSize?: number // in bytes
  allowedTypes?: string[]
  generateThumbnails?: boolean
  thumbnailSize?: { width: number; height: number }
}

class FileAddService {
  private readonly defaultOptions: FileProcessingOptions = {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
    generateThumbnails: true,
    thumbnailSize: { width: 200, height: 300 }
  }

  /**
   * Trigger file selection dialog
   */
  triggerFileSelect(multiple = true): Promise<File[]> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = this.defaultOptions.allowedTypes!.join(',')
      input.multiple = multiple

      input.onchange = () => {
        const files = Array.from(input.files || [])
        resolve(files)
      }

      input.oncancel = () => {
        resolve([])
      }

      input.onerror = () => {
        reject(new Error('File selection failed'))
      }

      input.click()
    })
  }

  /**
   * Validate file against options
   */
  private validateFile(file: File, options: FileProcessingOptions): { valid: boolean; error?: string } {
    if (file.size > (options.maxFileSize || this.defaultOptions.maxFileSize!)) {
      return {
        valid: false,
        error: `File "${file.name}" is too large. Maximum size is ${Math.round((options.maxFileSize || this.defaultOptions.maxFileSize!) / 1024 / 1024)}MB`
      }
    }

    if (!options.allowedTypes!.includes(file.type)) {
      return {
        valid: false,
        error: `File "${file.name}" has unsupported type: ${file.type}`
      }
    }

    return { valid: true }
  }

  /**
   * Generate thumbnail from image file as base64
   */
  private async generateThumbnail(file: File, maxSize: { width: number; height: number }): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const img = new Image()

      img.onload = () => {
        // Calculate thumbnail dimensions maintaining aspect ratio
        const { width, height } = this.calculateDimensions(
          img.width,
          img.height,
          maxSize.width,
          maxSize.height
        )

        canvas.width = width
        canvas.height = height

        // Draw and resize image
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to base64
        const base64 = canvas.toDataURL('image/jpeg', 0.8)
        resolve(base64)
      }

      img.onerror = () => reject(new Error('Failed to load image for thumbnail generation'))

      // Load the image
      img.src = URL.createObjectURL(file)
    })
  }

  /**
   * Convert file to base64
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Failed to convert file to base64'))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  /**
   * Calculate dimensions maintaining aspect ratio
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    const widthRatio = maxWidth / originalWidth
    const heightRatio = maxHeight / originalHeight
    const ratio = Math.min(widthRatio, heightRatio, 1) // Don't upscale

    return {
      width: Math.round(originalWidth * ratio),
      height: Math.round(originalHeight * ratio)
    }
  }

  /**
   * Get image dimensions
   */
  private getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()

      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }

      img.onerror = () => reject(new Error('Failed to load image'))

      img.src = URL.createObjectURL(file)
    })
  }

  /**
   * Process a single image file into a Page
   */
  private async processImageFile(file: File, options: FileProcessingOptions): Promise<Page> {
    const imageDimensions = await this.getImageDimensions(file)

    // Convert image to base64 for persistent storage
    const imageData = await this.fileToBase64(file)
    const imageUrl = this.base64ToBlobUrl(imageData, file.type)

    let thumbnailData: string | undefined
    let thumbnailUrl: string | undefined

    if (options.generateThumbnails) {
      try {
        thumbnailData = await this.generateThumbnail(file, options.thumbnailSize!)
        thumbnailUrl = this.base64ToBlobUrl(thumbnailData, 'image/jpeg')
      } catch (error) {
        console.warn('Failed to generate thumbnail for', file.name, error)
        // Fall back to using the original image as thumbnail
        thumbnailData = imageData
        thumbnailUrl = imageUrl
      }
    } else {
      thumbnailData = imageData
      thumbnailUrl = imageUrl
    }

    return {
      id: this.generatePageId(),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      status: 'idle',
      progress: 0,
      order: -1, // Will be set by store
      imageUrl,
      thumbnailUrl,
      imageData,
      thumbnailData,
      width: imageDimensions.width,
      height: imageDimensions.height,
      outputs: [],
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  /**
   * Process multiple files
   */
  async processFiles(files: File[], options: Partial<FileProcessingOptions> = {}): Promise<FileAddResult> {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const pages: Page[] = []
    const errors: string[] = []

    // Validate all files first
    for (const file of files) {
      const validation = this.validateFile(file, mergedOptions)
      if (!validation.valid) {
        errors.push(validation.error!)
        continue
      }

      // Only process image files for now (PDF support will be added later)
      if (file.type.startsWith('image/')) {
        try {
          const page = await this.processImageFile(file, mergedOptions)
          pages.push(page)
        } catch (error) {
          errors.push(`Failed to process "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      } else {
        errors.push(`Skipping non-image file "${file.name}" (PDF support coming soon)`)
      }
    }

    return {
      success: pages.length > 0 && errors.length === 0,
      pages,
      error: errors.length > 0 ? errors.join('; ') : undefined
    }
  }

  /**
   * Convert base64 to blob URL for display
   */
  private base64ToBlobUrl(base64: string, mimeType: string): string {
    // Remove data URL prefix if present
    const base64Data = base64.includes(',') ? (base64.split(',')[1] || '') : base64
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })
    return URL.createObjectURL(blob)
  }

  /**
   * Generate unique page ID
   */
  private generatePageId(): string {
    return `page_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  }

  /**
   * Revoke object URLs to free memory
   */
  revokePageUrls(page: Page): void {
    if (page.imageUrl) {
      URL.revokeObjectURL(page.imageUrl)
    }
    if (page.thumbnailUrl && page.thumbnailUrl !== page.imageUrl) {
      URL.revokeObjectURL(page.thumbnailUrl)
    }
  }

  /**
   * Revoke URLs for multiple pages
   */
  revokePagesUrls(pages: Page[]): void {
    pages.forEach(page => this.revokePageUrls(page))
  }
}

// Export singleton instance
export const fileAddService = new FileAddService()
export default fileAddService