import Dexie, { Table } from 'dexie'
import type { Page, PageProcessingLog, PageOutput } from '@/stores/pages'
import type { ProjectSettings } from '@/stores/project'

// Database interfaces for IndexedDB
export interface DBProject {
  id?: string
  name: string
  createdAt: Date
  updatedAt: Date
  settings: ProjectSettings
}

export interface DBPage {
  id?: string
  projectId: string
  pageNumber: number
  originalFileName: string
  status: 'idle' | 'processing' | 'completed' | 'error'
  progress: number
  imageUrl?: string
  thumbnailUrl?: string
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
  projects!: Table<DBProject>
  pages!: Table<DBPage>
  processingQueue!: Table<DBProcessingQueue>

  constructor() {
    super('Scan2DocDatabase')

    // Define schema
    this.version(1).stores({
      projects: '++id, name, createdAt, updatedAt',
      pages: '++id, projectId, pageNumber, originalFileName, status, progress, createdAt, updatedAt, processedAt',
      processingQueue: '++id, pageId, priority, addedAt'
    })
  }

  // Project methods
  async saveProject(project: DBProject): Promise<string> {
    if (project.id) {
      await this.projects.put(project)
      return project.id
    } else {
      return await this.projects.add(project)
    }
  }

  async getProject(id: string): Promise<DBProject | undefined> {
    return await this.projects.get(id)
  }

  async getAllProjects(): Promise<DBProject[]> {
    return await this.projects.orderBy('updatedAt').reverse().toArray()
  }

  async deleteProject(id: string): Promise<void> {
    await this.transaction('rw', [this.projects, this.pages, this.processingQueue], async () => {
      await this.projects.delete(id)
      await this.pages.where('projectId').equals(id).delete()
      await this.processingQueue.delete()
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

  async getPagesByProject(projectId: string): Promise<DBPage[]> {
    return await this.pages
      .where('projectId')
      .equals(projectId)
      .orderBy('pageNumber')
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

  async deletePagesByProject(projectId: string): Promise<void> {
    await this.transaction('rw', [this.pages, this.processingQueue], async () => {
      const pages = await this.pages.where('projectId').equals(projectId).toArray()
      const pageIds = pages.map(p => p.id!).filter(Boolean)

      await this.pages.where('projectId').equals(projectId).delete()
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

  // Utility methods
  async clearAllData(): Promise<void> {
    await this.transaction('rw', [this.projects, this.pages, this.processingQueue], async () => {
      await this.projects.clear()
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

// Export types for use in other files
export type { DBProject, DBPage, DBProcessingQueue }