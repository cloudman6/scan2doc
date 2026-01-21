import type { ReturnType } from 'pinia'
import type { usePagesStore } from './stores/pages'
import type { useHealthStore } from './stores/health'

declare global {
    interface Window {
        pagesStore: ReturnType<typeof usePagesStore>
        healthStore: ReturnType<typeof useHealthStore>
    }
}

export { }
