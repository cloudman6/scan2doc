import { describe, it, expect } from 'vitest'
import { MarkdownAssembler } from './markdown'
import type { OCRResult } from '@/services/ocr'
import sample1 from '../../../tests/e2e/samples/sample1.json'

describe('MarkdownAssembler', () => {
    const assembler = new MarkdownAssembler()
    const DIMS_1000 = { w: 1000, h: 1000 }

    it('should return raw_text as fallback if no tags found', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Hello World',
            raw_text: 'Hello World', // No tags
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toBe('Hello World')
    })

    it('should capture interstitial text between tags (Gap Text Bug Fix)', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // Tag -> Gap Text -> Tag
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,10,10]]<|/det|>First Block' +
                '\nIMPORTANT GAP TEXT\n' + // This text is NOT part of the regex match for the first block if not careful, or between blocks
                '<|ref|>text<|/ref|><|det|>[[0,20,10,30]]<|/det|>Second Block',
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())
        expect(result).toContain('First Block')
        expect(result).toContain('IMPORTANT GAP TEXT')
        expect(result).toContain('Second Block')
    })

    it('should render side-by-side elements as a table', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /* 
               Layout:
               Left block: 0-400 (Text)
               Right block: 500-900 (Image)
               Both Y: 0-100 (Perfect Overlap)
            */
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,400,100]]<|/det|>Left Text\n' +
                '<|ref|>image<|/ref|><|det|>[[500,0,900,100]]<|/det|>',
            boxes: [
                { box: [0, 0, 400, 100], label: 'text' },
                { box: [500, 0, 900, 100], label: 'image' }
            ],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([['1', 'img-right']]) // index 1 is image

        const result = assembler.assemble(ocrResult, imageMap)

        expect(result).toContain('<table>')
        expect(result).toContain('Left Text')
        expect(result).toContain('scan2doc-img:img-right')

        expect(result).toContain('width="40%"')
    })

    it('should render sequential elements normally (no table)', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /*
               Layout:
               Top: 0-100
               Bottom: 200-300
            */
            raw_text:
                '<|ref|>text<|/ref|><|det|>[[0,0,100,100]]<|/det|>Top Line\n' +
                '<|ref|>text<|/ref|><|det|>[[0,200,100,300]]<|/det|>Bottom Line',
            boxes: [
                { box: [0, 0, 100, 100], label: 'text' },
                { box: [0, 200, 100, 300], label: 'text' }
            ],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        expect(result).toContain('Top Line')
        expect(result).toContain('Bottom Line')
        expect(result).not.toContain('<table>')
    })

    it('should clean raw_text by removing noisy ref tags (title, text) from visible content', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            // The REF tag contains "title", the content contains "My Title"
            raw_text: '<|ref|>title<|/ref|><|det|>[[0,0,100,100]]<|/det|>My Title',
            boxes: [{ box: [0, 0, 100, 100], label: 'title' }],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        const result = assembler.assemble(ocrResult, new Map())

        // "title" from the ref tag should not appear in the FINAL markdown output
        // The parser logic uses 'title' as type, but only outputs 'content' ("My Title")
        expect(result).toContain('My Title')
        expect(result).not.toContain('title') // The word "title" shouldn't leak
    })

    it('should throw error if raw_text is missing', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: 'Fallback Text',
            // @ts-expect-error -- testing missing raw_text
            raw_text: null,
            boxes: [],
            image_dims: DIMS_1000,
            prompt_type: 'document'
        }
        expect(() => assembler.assemble(ocrResult, new Map())).toThrow('OCR result missing raw_text')
    })

    it('should handle approximate coordinate matching and normalized coords', () => {
        const ocrResult: OCRResult = {
            success: true,
            text: '',
            /*
               Normalized raw_text coords: [100, 100, 200, 200] (0-1000 scale)
               Absolute boxes: [200, 200, 400, 400] (for 2000x2000 image)
            */
            raw_text: '<|ref|>image<|/ref|><|det|>[[100,100,200,200]]<|/det|>',
            boxes: [
                { box: [200, 200, 400, 400], label: 'image' }
            ],
            image_dims: { w: 2000, h: 2000 },
            prompt_type: 'document'
        }
        const imageMap = new Map<string, string>([['0', 'img-real']])

        const result = assembler.assemble(ocrResult, imageMap)

        expect(result).toContain('![Figure 1](scan2doc-img:img-real)')
    })

    describe('Real World Sample Integration', () => {
        it('should correctly process sample1.json structure and preserve ALL content', () => {
            // Setup Image Map based on sample1 boxes
            const imageMap = new Map<string, string>([
                ['6', 'img-6'],
                ['7', 'img-7'],
                ['12', 'img-12'],
                ['13', 'img-13'],
                ['14', 'img-14'],
                ['15', 'img-15']
            ])

            // @ts-expect-error -- importing json as any/unknown
            const result = assembler.assemble(sample1 as OCRResult, imageMap)

            // 1. Verify Noisy Labels are gone
            expect(result).not.toMatch(/^title$/m)
            expect(result).not.toMatch(/^text$/m)

            // 2. Generic Content Verification
            // Extract all meaningful text chunks from raw_text using a simplified Logic
            // We want to ensure everything that LOOKS like content (not tags) exists in Result.

            const rawText = sample1.raw_text || ''
            // Split by tags to get text chunks
            // Regex to split by <|ref|>...<|/det|>
            // We can just replace all tags with a special delimiter, then split
            const cleanedRaw = rawText.replace(/<\|ref\|>.*?<\|\/ref\|><\|det\|>\[\[.*?\]\]<\|\/det\|>/g, '___SPLIT___')
            const expectedChunks = cleanedRaw.split('___SPLIT___')
                .map(s => s.trim())
                .filter(s => s.length > 0)

            // Verify EVERY chunk exists in the output
            for (const chunk of expectedChunks) {
                // We need to be careful about images. 
                // Images in raw_text might be empty string or usually blank after tag.
                // If the chunk is just blank, we filtered it out above.
                // If the chunk contains content, it MUST be in the result.
                expect(result).toContain(chunk)
            }

            // Also sanity check specifically for known fields just in case regex logic above is slightly off vs parser
            expect(result).toContain('OSTE0KJ3000')
            expect(result).toContain('骨密度')

            // 3. Verify Table Layout for "Result Analysis" Section
            const analysisIndex = result.indexOf('# 结果分析')
            const tableIndex = result.indexOf('<table>', analysisIndex)
            expect(tableIndex).not.toBe(-1)

            const tablePart = result.substring(tableIndex)
            const imgCount = (tablePart.match(/scan2doc-img:img-/g) || []).length
            expect(imgCount).toBeGreaterThanOrEqual(4)
        })
    })
})
