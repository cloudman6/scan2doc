import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import AppHeader from './AppHeader.vue'
import { NLayoutHeader, NButton, NTag, NSpin, NIcon } from 'naive-ui'

// Mock child component
vi.mock('@/components/common/OCRQueuePopover.vue', () => ({
    default: {
        template: '<div>OCR Queue</div>'
    }
}))

// Manual store mock
const mockStore = reactive({
    activeOCRTasks: [],
    queuedOCRTasks: [],
    ocrTaskCount: 0
})

vi.mock('@/stores/pages', () => ({
    usePagesStore: () => mockStore
}))

interface HeaderVM {
    showQueue: boolean;
    handleAddFiles: () => void;
    $nextTick: () => Promise<void>;
}

describe('AppHeader', () => {
    // Reset store before each test
    beforeEach(() => {
        mockStore.activeOCRTasks = []
        mockStore.queuedOCRTasks = []
        mockStore.ocrTaskCount = 0
    })

    const createMountOptions = (props = {}) => ({
        global: {
            components: {
                NLayoutHeader,
                NButton,
                NTag,
                NSpin,
                NIcon
            },
            stubs: {
                OCRQueuePopover: {
                    name: 'OCRQueuePopover',
                    template: '<div class="ocr-queue-popover-stub"><slot></slot></div>'
                },
                NPopover: {
                    template: '<div class="n-popover-stub"><slot name="trigger"></slot><slot></slot></div>'
                }
            }
        },
        props: {
            pageCount: 0,
            ...props
        }
    })

    it('renders branding correctly', () => {
        const wrapper = mount(AppHeader, createMountOptions())

        expect(wrapper.text()).toContain('Scan2Doc')
        expect(wrapper.find('.header-brand').exists()).toBe(true)
    })

    it('displays correct page count', () => {
        const wrapper = mount(AppHeader, createMountOptions({ pageCount: 5 }))
        expect(wrapper.text()).toContain('5 Pages Loaded')
    })

    it('displays singular page text', () => {
        const wrapper = mount(AppHeader, createMountOptions({ pageCount: 1 }))
        expect(wrapper.text()).toContain('1 Page Loaded')
    })

    it('emits add-files event when import button is clicked', async () => {
        const wrapper = mount(AppHeader, createMountOptions())


        // Find the primary button (Import Files)


        // To make it robust, we can look for the button that handles the click
        await wrapper.find('button[type="button"].n-button--primary-type').trigger('click')

        expect(wrapper.emitted('add-files')).toBeTruthy()
    })

    it('displays OCR status pill when tasks are present', async () => {
        // Set store state BEFORE mount
        // @ts-expect-error - manual store mock
        mockStore.activeOCRTasks = [{ id: '1', status: 'recognizing' }]
        // @ts-expect-error - manual store mock
        mockStore.ocrTaskCount = 1

        const wrapper = mount(AppHeader, createMountOptions({ pageCount: 1 }))

        await wrapper.vm.$nextTick()

        expect(wrapper.text()).toContain('Processing: 1')
        expect(wrapper.find('.status-pill').exists()).toBe(true)
    })

    it('emits add-files event when add button is clicked', async () => {
        const wrapper = mount(AppHeader, createMountOptions())
        const addBtn = wrapper.find('.add-btn')
        await addBtn.trigger('click')
        expect(wrapper.emitted('add-files')).toBeTruthy()
    })

    it('toggles showQueue when event is emitted from popover', async () => {
        mockStore.ocrTaskCount = 1
        const wrapper = mount(AppHeader, createMountOptions())
        const vm = wrapper.vm as unknown as HeaderVM
        await vm.$nextTick()

        // Set showQueue to true first
        vm.showQueue = true
        await vm.$nextTick()

        // Find the popover stub
        const popover = wrapper.findComponent({ name: 'OCRQueuePopover' })
        expect(popover.exists()).toBe(true)

        // Emit close event
        await popover.vm.$emit('close')
        expect(vm.showQueue).toBe(false)
    })

    it('does not display OCR status pill when tasks are empty', async () => {
        mockStore.ocrTaskCount = 0
        const wrapper = mount(AppHeader, createMountOptions())
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.status-pill').exists()).toBe(false)
    })
})
