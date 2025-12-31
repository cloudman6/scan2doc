import { describe, it, expect } from 'vitest'
import { parseRawText, normalizeBox, findMatchingBoxIndex } from './ocr-parser'

describe('ocr-parser', () => {
    describe('parseRawText', () => {
        it('should parse raw_text with tags into blocks', () => {
            const rawText = '<|ref|>title<|/ref|><|det|>[[100, 50, 300, 80]]<|/det|>\n# Hello World  \n\n<|ref|>text<|/ref|><|det|>[[100, 100, 500, 150]]<|/det|>\nThis is some text.  '
            const dims = { w: 1000, h: 1000 }

            const blocks = parseRawText(rawText, dims)

            expect(blocks).toHaveLength(2)
            expect(blocks[0]).toEqual({
                type: 'title',
                content: '# Hello World',
                box: [100, 50, 300, 80]
            })
            expect(blocks[1]).toEqual({
                type: 'text',
                content: 'This is some text.',
                box: [100, 100, 500, 150]
            })
        })

        it('should handle image type blocks', () => {
            const rawText = '<|ref|>image<|/ref|><|det|>[[200, 200, 400, 400]]<|/det|>  '
            const dims = { w: 1000, h: 1000 }

            const blocks = parseRawText(rawText, dims)

            expect(blocks).toHaveLength(1)
            expect(blocks[0]!.type).toBe('image')
            expect(blocks[0]!.content).toBe('')
            expect(blocks[0]!.box).toEqual([200, 200, 400, 400])
        })

        it('should return empty array for empty raw_text', () => {
            const blocks = parseRawText('', { w: 1000, h: 1000 })
            expect(blocks).toEqual([])
        })

        it('should return empty array for null/undefined', () => {
            const blocks = parseRawText(null as unknown as string, { w: 1000, h: 1000 })
            expect(blocks).toEqual([])
        })

        it('should handle malformed coordinates gracefully', () => {
            const rawText = '<|ref|>text<|/ref|><|det|>[[100, 200]]<|/det|>\nBad coords'
            const dims = { w: 1000, h: 1000 }

            const blocks = parseRawText(rawText, dims)
            // Should skip blocks with invalid coords
            expect(blocks).toHaveLength(0)
        })

        it('should normalize 1000-scale coordinates to actual dimensions', () => {
            const rawText = '<|ref|>text<|/ref|><|det|>[[500, 500, 1000, 1000]]<|/det|>\nTest'
            const dims = { w: 2000, h: 1500 }

            const blocks = parseRawText(rawText, dims)

            expect(blocks).toHaveLength(1)
            // 500/1000 * 2000 = 1000, 500/1000 * 1500 = 750
            expect(blocks[0]!.box).toEqual([1000, 750, 2000, 1500])
        })

        it('should parse real sample data format', () => {
            // Sample from sample1.json
            const rawText = '<|ref|>title<|/ref|><|det|>[[488, 66, 678, 87]]<|/det|>\n# OSTE0KJ3000  \n\n<|ref|>title<|/ref|><|det|>[[483, 90, 691, 108]]<|/det|>\n# 超声骨密度检测报告  '
            const dims = { w: 1487, h: 2105 }

            const blocks = parseRawText(rawText, dims)

            expect(blocks).toHaveLength(2)
            expect(blocks[0]!.type).toBe('title')
            expect(blocks[0]!.content).toBe('# OSTE0KJ3000')
            // Coordinates should be normalized (488 < 1000, but dims.w > 1000)
            expect(blocks[0]!.box[0]).toBeCloseTo(488 / 1000 * 1487, 0)
        })

        it('should use boxes array coordinates when provided', () => {
            // raw_text has normalized coords [58, 33, 940, 465]
            // boxes array has actual coords [86, 69, 1399, 979]
            const rawText = '<|ref|>table<|/ref|><|det|>[[58, 33, 940, 465]]<|/det|>\nTable content'
            const dims = { w: 1487, h: 2105 }
            const boxes = [
                { label: 'table', box: [86, 69, 1399, 979] as [number, number, number, number] }
            ]

            const blocks = parseRawText(rawText, dims, boxes)

            expect(blocks).toHaveLength(1)
            // Should use the boxes array coordinates, not the normalized raw_text coords
            expect(blocks[0]!.box).toEqual([86, 69, 1399, 979])
        })
    })

    describe('findMatchingBoxIndex', () => {
        it('should find matching box by normalized coordinates', () => {
            const rawCoords = [58, 33, 940, 465] // 1000-scale
            const boxes = [
                { label: 'table', box: [86, 69, 1399, 979] as [number, number, number, number] }
            ]
            const dims = { w: 1487, h: 2105 }

            const index = findMatchingBoxIndex(rawCoords, boxes, dims)

            expect(index).toBe(0)
        })

        it('should return -1 when no match found', () => {
            const rawCoords = [500, 500, 600, 600]
            const boxes = [
                { label: 'table', box: [86, 69, 1399, 979] as [number, number, number, number] }
            ]
            const dims = { w: 1487, h: 2105 }

            const index = findMatchingBoxIndex(rawCoords, boxes, dims)

            expect(index).toBe(-1)
        })

        it('should return -1 for empty boxes array', () => {
            const index = findMatchingBoxIndex([100, 100, 200, 200], [], { w: 1000, h: 1000 })
            expect(index).toBe(-1)
        })
    })

    describe('normalizeBox', () => {
        it('should return original coords if within image bounds', () => {
            const coords = [100, 200, 300, 400]
            const dims = { w: 500, h: 500 }

            const result = normalizeBox(coords, dims)

            expect(result).toEqual([100, 200, 300, 400])
        })

        it('should scale 1000-based coords to larger dimensions', () => {
            const coords = [500, 500, 1000, 1000]
            const dims = { w: 2000, h: 1500 }

            const result = normalizeBox(coords, dims)

            expect(result).toEqual([1000, 750, 2000, 1500])
        })

        it('should handle empty/short coords array', () => {
            expect(normalizeBox([], { w: 1000, h: 1000 })).toEqual([0, 0, 0, 0])
            expect(normalizeBox([1, 2], { w: 1000, h: 1000 })).toEqual([0, 0, 0, 0])
        })
    })
})

