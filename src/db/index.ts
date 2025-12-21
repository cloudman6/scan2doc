import Dexie, { type Table } from 'dexie'
import type { PageProcessingLog, PageOutput } from '@/stores/pages'

export interface DBFile {
  id?: string
  name: string
  content: Blob
  size: number
  type: string
  createdAt: Date
}

export interface DBPage {
  id?: string
  fileId?: string // Reference to DBFile
  pageNumber?: number // Page number in the original file
  fileName: string
  fileSize: number
  fileType: string
  origin: 'upload' | 'pdf_generated'
  status: 'pending_render' | 'rendering' | 'ready' | 'recognizing' | 'completed' | 'error'
  progress: number
  order: number  // Sort order for drag and drop
  imageData?: string  // base64 image data
  thumbnailData?: string  // base64 thumbnail data
  width?: number
  height?: number
  ocrText?: string
  ocrConfidence?: number
  outputs: PageOutput[]
  logs: PageProcessingLog[]
  createdAt: Date
  updatedAt: Date
  processedAt?: Date
  // Store original PDF data for reliable re-rendering
  originalPdfData?: ArrayBuffer
  // Store PDF base64 for easier reconstruction
  pdfBase64?: string
}

export interface DBProcessingQueue {
  id?: string
  pageId: string
  priority: number
  addedAt: Date
}

export class Scan2DocDB extends Dexie {
  pages!: Table<DBPage>
  files!: Table<DBFile>
  processingQueue!: Table<DBProcessingQueue>

  constructor() {
    super('Scan2DocDatabase')

    // Define schema
    this.version(3).stores({
      pages: '++id, fileId, pageNumber, fileName, fileSize, fileType, origin, status, progress, order, createdAt, updatedAt, processedAt',
      files: '++id, name, size, createdAt',
      processingQueue: '++id, pageId, priority, addedAt'
    }).upgrade(tx => {
      // Migration to version 3
      // We don't need complex migration for now as this is a new feature
      // Existing pages will just have undefined fileId/pageNumber and won't be resumable
    })
  }

  // File methods
  async saveFile(file: DBFile): Promise<string> {
    if (file.id) {
      await this.files.put(file)
      return file.id
    } else {
      // Use put instead of add to handle ID generation correctly with string IDs if needed
      // But for auto-increment keys (if we used number), add is fine.
      // Since we defined ++id, it will be a number or string depending on Dexie config.
      // Let's assume standard behavior.
      const id = await this.files.add(file)
      return id.toString()
    }
  }

  async getFile(id: string): Promise<DBFile | undefined> {
    // Try to parse as number if the ID looks like a number, since we used ++id
    // But we'll try string access first to be generic
    let file = await this.files.get(id)
    if (!file && !isNaN(Number(id))) {
       file = await this.files.get(Number(id))
    }
    return file
  }

  async deleteFile(id: string): Promise<void> {
    await this.files.delete(id)
    if (!isNaN(Number(id))) {
      await this.files.delete(Number(id))
    }
  }

  // Page methods
  async savePage(page: DBPage): Promise<string> {
    if (page.id) {
      await this.pages.put(page)
      return page.id
    } else {
      return await this.pages.add(page)
    }
  }

  async getPage(id: string): Promise<DBPage | undefined> {
    return await this.pages.get(id)
  }

  async getAllPages(): Promise<DBPage[]> {
    return await this.pages
      .orderBy('order')
      .toArray()
  }

  async getPagesByStatus(status: DBPage['status']): Promise<DBPage[]> {
    return await this.pages
      .where('status')
      .equals(status)
      .toArray()
  }

  async deletePage(id: string): Promise<void> {
    await this.pages.delete(id)
    await this.processingQueue.where('pageId').equals(id).delete()
  }

  async deleteAllPages(): Promise<void> {
    await this.transaction('rw', [this.pages, this.processingQueue], async () => {
      const pages = await this.pages.toArray()
      const pageIds = pages.map(p => p.id!).filter(Boolean)

      await this.pages.clear()
      if (pageIds.length > 0) {
        await this.processingQueue.where('pageId').anyOf(pageIds).delete()
      }
    })
  }

  // Processing queue methods
  async addToQueue(pageId: string, priority: number = 0): Promise<string> {
    const existing = await this.processingQueue.where('pageId').equals(pageId).first()
    if (existing) {
      return existing.id!
    }

    return await this.processingQueue.add({
      pageId,
      priority,
      addedAt: new Date()
    })
  }

  async removeFromQueue(pageId: string): Promise<void> {
    await this.processingQueue.where('pageId').equals(pageId).delete()
  }

  async getNextFromQueue(): Promise<DBProcessingQueue | undefined> {
    return await this.processingQueue
      .orderBy('priority')
      .reverse()
      .first()
  }

  async getQueueCount(): Promise<number> {
    return await this.processingQueue.count()
  }

  // Page creation from file add
  async saveAddedPage(pageData: Omit<DBPage, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const dbPage: DBPage = {
      ...pageData,
      id: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    return await this.pages.add(dbPage)
  }

  // Get all pages for UI display
  async getAllPagesForDisplay(): Promise<DBPage[]> {
    return await this.getAllPages()
  }

  // Update order for multiple pages
  async updatePagesOrder(pageOrders: { id: string; order: number }[]): Promise<void> {
    await this.transaction('rw', this.pages, async () => {
      for (const { id, order } of pageOrders) {
        await this.pages.update(id, { order, updatedAt: new Date() })
      }
    })
  }

  // Get next order value for new pages
  async getNextOrder(): Promise<number> {
    const maxOrder = await this.pages.orderBy('order').last()
    return maxOrder ? maxOrder.order + 1 : 0
  }

  // Utility methods
  async clearAllData(): Promise<void> {
    await this.transaction('rw', [this.pages, this.processingQueue], async () => {
      await this.pages.clear()
      await this.processingQueue.clear()
    })
  }

  async getStorageSize(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate()
      return estimate.usage || 0
    }
    return 0
  }
}

// Create and export a singleton instance
export const db = new Scan2DocDB()