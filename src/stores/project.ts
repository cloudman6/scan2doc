import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ProjectSettings {
  ocrProvider: 'tesseract' | 'vision-ai' | 'google-cloud'
  exportFormat: 'markdown' | 'html' | 'docx' | 'pdf'
  autoSave: boolean
  language: string
}

export const useProjectStore = defineStore('project', () => {
  // State
  const name = ref<string>('Untitled Project')
  const createdAt = ref<Date>(new Date())
  const updatedAt = ref<Date>(new Date())
  const settings = ref<ProjectSettings>({
    ocrProvider: 'tesseract',
    exportFormat: 'markdown',
    autoSave: true,
    language: 'eng'
  })

  // Getters
  const displayName = computed(() =>
    name.value === 'Untitled Project' ? 'New Document' : name.value
  )

  const isDirty = computed(() => {
    // TODO: Implement dirty checking when we have more state
    return false
  })

  // Actions
  function setName(newName: string) {
    name.value = newName
    updateTimestamp()
  }

  function updateSettings(newSettings: Partial<ProjectSettings>) {
    settings.value = { ...settings.value, ...newSettings }
    updateTimestamp()
  }

  function updateTimestamp() {
    updatedAt.value = new Date()
  }

  function reset() {
    name.value = 'Untitled Project'
    createdAt.value = new Date()
    updatedAt.value = new Date()
    settings.value = {
      ocrProvider: 'tesseract',
      exportFormat: 'markdown',
      autoSave: true,
      language: 'eng'
    }
  }

  return {
    // State
    name,
    createdAt,
    updatedAt,
    settings,

    // Getters
    displayName,
    isDirty,

    // Actions
    setName,
    updateSettings,
    updateTimestamp,
    reset
  }
})