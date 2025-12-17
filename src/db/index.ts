import Dexie, { type Table } from 'dexie'
import type { PageProcessingLog, PageOutput } from '@/stores/pages'

export interface DBPage {
  id?: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'idle' | 'processing' | 'completed' | 'error'
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
}

export interface DBProcessingQueue {
  id?: string
  pageId: string
  priority: number
  addedAt: Date
}

export class Scan2DocDB extends Dexie {
  pages!: Table<DBPage>
  processingQueue!: Table<DBProcessingQueue>

  constructor() {
    super('Scan2DocDatabase')

    // Define schema with order field included from the start
    this.version(1).stores({
      pages: '++id, fileName, fileSize, fileType, status, progress, order, createdAt, updatedAt, processedAt',
      processingQueue: '++id, pageId, priority, addedAt'
    })
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