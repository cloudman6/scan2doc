import type { OCRResult, OCRBox } from '@/services/ocr'

interface Block {
    type: string
    content: string
    box: number[] // [x1, y1, x2, y2]
    imageId?: string
    isImage: boolean
}

interface Row {
    blocks: Block[]
    top: number
    bottom: number
}

export class MarkdownAssembler {
    private figureCount = 1

    /**
     * Assemble OCR result and extracted images into a Markdown string.
     * Reconstructs layout using HTML tables for side-by-side elements.
     * 
     * @param ocrResult The original OCR result containing text and boxes
     * @param imageMap A map of box index to extracted image ID
     * @returns The generated Markdown string
     */
    assemble(ocrResult: OCRResult, imageMap: Map<string, string>): string {
        if (!ocrResult.raw_text) {
            throw new Error('OCR result missing raw_text')
        }

        this.figureCount = 1

        // 1. Parse into blocks (tokenization + initial cleaning)
        const blocks = this.parseBlocks(ocrResult, imageMap)

        if (blocks.length === 0) {
            // Fallback for empty or non-matching raw_text (though unlikely)
            return ocrResult.raw_text
        }

        // 2. Layout Analysis: Group blocks into visual rows
        const rows = this.groupIntoRows(blocks)

        // 3. Render rows
        // We need image width to calculate table percentages. 
        // Default to a reasonable width if missing (e.g. 1000)
        const pageW = ocrResult.image_dims?.w || 1000

        let markdown = this.renderRows(rows, pageW)

        // 4. Handle remaining/unmatched images (Legacy fallback support)
        // Check which images were used
        const usedImageIds = new Set<string>()
        blocks.forEach(b => { if (b.imageId) usedImageIds.add(b.imageId) })

        const allIndices = Array.from(imageMap.keys()).sort((a, b) => parseInt(a) - parseInt(b))
        const remainingImages: string[] = []

        for (const indexStr of allIndices) {
            const id = imageMap.get(indexStr)
            if (id && !usedImageIds.has(id)) {
                const caption = `Figure ${this.figureCount++}`
                remainingImages.push(`![${caption}](scan2doc-img:${id})`)
            }
        }

        if (remainingImages.length > 0) {
            markdown += '\n\n## Figures\n'
            markdown += remainingImages.join('\n')
        }

        return markdown.trim()
    }

    private parseBlocks(ocrResult: OCRResult, imageMap: Map<string, string>): Block[] {
        const blocks: Block[] = []
        // Regex to capture Ref, Det, and Content
        // <|ref|>TYPE<|/ref|><|det|>[[x,y,x,y]]<|/det|>CONTENT
        const regex = /<\|ref\|>(.*?)<\|\/ref\|><\|det\|>\[\[(.*?)\]\]<\|\/det\|>([\s\S]*?)(?=(?:<\|ref\|>)|$)/g

        let lastIndex = 0
        let match

        while ((match = regex.exec(ocrResult.raw_text)) !== null) {
            // 1. Capture any text preceding this match (the "gap")
            const gapText = ocrResult.raw_text.substring(lastIndex, match.index)
            if (gapText.trim()) {
                blocks.push({
                    type: 'text',
                    content: gapText.trim(),
                    box: [0, 0, ocrResult.image_dims.w, 0], // Unknown position, assume top
                    isImage: false
                })
            }

            // 2. Process the match
            const type = match[1]!.trim().toLowerCase()
            const coordsStr = match[2]!
            const rawContent = match[3]!
            const coords = coordsStr.split(',').map(Number)

            if (coords.length === 4) {
                // Map to image
                const matchedIndex = this.findMatchingBoxIndex(coords, ocrResult.boxes, ocrResult.image_dims)
                const imageId = matchedIndex !== -1 ? imageMap.get(matchedIndex.toString()) : undefined

                let isImage = (type === 'image' || type === 'figure')
                let content = rawContent.trim()

                // If we have an image ID, force treat as image and generate Markdown link
                if (imageId) {
                    isImage = true
                    const caption = `Figure ${this.figureCount++}`
                    content = `![${caption}](scan2doc-img:${imageId})`
                }

                // Normalize box to absolute coordinates

                const absBox = this.normalizeBox(coords, ocrResult.image_dims!)

                blocks.push({
                    type,
                    content,
                    box: absBox,
                    imageId,
                    isImage
                })
            }

            lastIndex = regex.lastIndex
        }

        // 3. Capture any remaining text after the last match
        if (lastIndex < ocrResult.raw_text.length) {
            const tailText = ocrResult.raw_text.substring(lastIndex)
            if (tailText.trim()) {
                blocks.push({
                    type: 'text',
                    content: tailText.trim(),

                    box: [0, 0, ocrResult.image_dims!.w, ocrResult.image_dims!.h], // Assume bottom
                    isImage: false
                })
            }
        }

        return blocks
    }

    private groupIntoRows(blocks: Block[]): Row[] {
        if (blocks.length === 0) return []

        // Sort by Y1 (top)
        const sorted = [...blocks].sort((a, b) => (a.box[1] || 0) - (b.box[1] || 0))
        const rows: Row[] = []

        let currentRow: Row | null = null

        for (const block of sorted) {
            // Ignore empty content blocks (e.g. just a placeholder ref with no text/image)
            if (!block.content && !block.isImage) continue

            const bTop = block.box[1] || 0
            const bBottom = block.box[3] || 0

            if (!currentRow) {
                currentRow = { blocks: [block], top: bTop, bottom: bBottom }
                continue
            }

            // Calculate Vertical Intersection over Union (or just Intersection check)
            // Intersection
            const y1 = Math.max(currentRow.top, bTop)
            const y2 = Math.min(currentRow.bottom, bBottom)
            const intersection = Math.max(0, y2 - y1)

            // Compare intersection to heights
            const rowH = currentRow.bottom - currentRow.top
            const blockH = bBottom - bTop
            const minH = Math.min(rowH, blockH)

            // Threshold: if they overlap significantly (e.g. > 50% of the smaller item's height)
            // AND they don't overlap horizontally (which would mean they are layered?? shouldn't happen in OCR usually)
            // OR if the block is essentially "inside" the row Y-range
            if (intersection > minH * 0.5) {
                // Add to row
                currentRow.blocks.push(block)
                // Expand row bounds
                currentRow.top = Math.min(currentRow.top, bTop)
                currentRow.bottom = Math.max(currentRow.bottom, bBottom)
            } else {
                // Finish old row
                // Sort blocks in row by X1
                currentRow.blocks.sort((a, b) => (a.box[0] || 0) - (b.box[0] || 0))
                rows.push(currentRow)
                // Start new row
                currentRow = { blocks: [block], top: bTop, bottom: bBottom }
            }
        }

        if (currentRow) {
            currentRow.blocks.sort((a, b) => (a.box[0] || 0) - (b.box[0] || 0))
            rows.push(currentRow)
        }

        return rows
    }

    private renderRows(rows: Row[], pageW: number): string {
        let output = ''

        for (const row of rows) {
            const blocks = row.blocks
            if (blocks.length === 0) continue

            if (blocks.length === 1) {
                // Normal paragraph
                output += blocks[0]!.content + '\n\n'
            } else {
                // Multi-column layout -> HTML Table
                // Calculate percentages
                // We use spaces between blocks as well? 
                // Simple approach: block width / pageW. Scaling to 100% total?
                // Better: block width / sum(block widths)? Or relative to page?
                // Relative to page is safer to preserve "gaps".

                const cells = blocks.map(b => {
                    const w = Math.max(1, (b.box[2] || 0) - (b.box[0] || 0))
                    const pct = Math.round((w / pageW) * 100)
                    return { content: b.content, width: pct }
                })

                // If total > 100, scale down?
                const totalPct = cells.reduce((sum, c) => sum + c.width, 0)
                if (totalPct > 100) {
                    cells.forEach(c => c.width = Math.floor(c.width / totalPct * 100))
                }
                // If total < 90, maybe expand or leave gaps? 
                // Let's just use the widths as calculated, browser handles the rest or we force width.

                output += '<table>\n<tr>\n'
                cells.forEach(c => {
                    // Convert content to HTML? No, Markdown inside HTML is tricky.
                    // Common Markdown parsers support Markdown in block HTML if empty lines present?
                    // Or we just output raw markdown and hope.
                    // Standard: <td width="50%">...</td>
                    // For best compatibility, usually we need a blank line before/after table? 
                    // But inside TD? Markdown-it might not parse markdown inside HTML tags by default.
                    // User requirement: "尽量还原". HTML table is acceptable.
                    // If content is simple text, it's fine. If it's `![img](...)`, it's Markdown.
                    // Many viewers render MD inside TD.

                    // We can also use "display: flex" div? But user accepted Table plan.

                    output += `<td width="${c.width}%">\n\n${c.content}\n\n</td>\n`
                })
                output += '</tr>\n</table>\n\n'
            }
        }

        return output
    }

    private normalizeBox(coords: number[], dims: { w: number, h: number }): number[] {
        // [x1, y1, x2, y2]
        if (coords.length < 4) return [0, 0, 0, 0]

        // If max coordinate <= 1000 and the image dimension is > 1000, 
        // assume it is 1000-normalized.
        // NOTE: Some OCR engines output 0-1000 fixed.
        const maxCoord = Math.max(...coords)
        if (maxCoord <= 1000 && (dims.w > 1000 || dims.h > 1000)) {
            return [
                (coords[0]! / 1000) * dims.w,
                (coords[1]! / 1000) * dims.h,
                (coords[2]! / 1000) * dims.w,
                (coords[3]! / 1000) * dims.h,
            ]
        }
        return coords
    }

    // eslint-disable-next-line complexity
    private findMatchingBoxIndex(
        targetCoords: number[],
        boxes: OCRBox[],
        imageDims: { w: number, h: number }
    ): number {
        // Reuse logic but we need to supply 'imageDims' to normalize inputs for comparison if needed
        // My 'normalizeBox' is consistent with this.
        // To be safe, we check both raw and normalized match (IoU or Delta)

        if (boxes.length === 0) return -1

        // We try both as-is and 1000-scaled versions of targetCoords just in case
        // Logic from previous implementation:
        const candidates = [
            targetCoords,
            [
                (targetCoords[0]! / 1000) * imageDims.w,
                (targetCoords[1]! / 1000) * imageDims.h,
                (targetCoords[2]! / 1000) * imageDims.w,
                (targetCoords[3]! / 1000) * imageDims.h,
            ]
        ]

        const DELTA = 20 // increased tolerance slightly

        for (const coords of candidates) {
            for (let i = 0; i < boxes.length; i++) {
                const box = boxes[i]!.box
                if (
                    Math.abs(box[0] - (coords[0] || 0)) <= DELTA &&
                    Math.abs(box[1] - (coords[1] || 0)) <= DELTA &&
                    Math.abs(box[2] - (coords[2] || 0)) <= DELTA &&
                    Math.abs(box[3] - (coords[3] || 0)) <= DELTA
                ) {
                    return i
                }
            }
        }

        return -1
    }
}

export const markdownAssembler = new MarkdownAssembler()
