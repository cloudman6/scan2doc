import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Preview from './Preview.vue'

// Basic mock for Naive UI
vi.mock('naive-ui', () => ({
  NTabs: { template: '<div><slot></slot></div>' },
  NTabPane: { template: '<div><slot></slot></div>' },
  NEmpty: { template: '<div></div>' },
  NButton: { template: '<button></button>' },
  NSpin: { template: '<div></div>' }
}))

// Mock DB
vi.mock('@/db', () => ({ db: { getPageImage: vi.fn() } }))

// Mock URL
globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
globalThis.URL.revokeObjectURL = vi.fn()

describe('Preview.vue', () => {
  it('mounts correctly', async () => {
    const wrapper = mount(Preview, {
      props: {
        currentPage: {
          id: '1',
          status: 'ready',
          outputs: []
        }
      }
    })
    expect(wrapper.exists()).toBe(true)
  })
})
