import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle
} from 'docx'
import { db } from '@/db'
import { consola } from 'consola'
import MarkdownIt from 'markdown-it'
// @ts-expect-error -- No types for this specific plugin
import MarkdownItKatex from '@iktakahiro/markdown-it-katex'
import type Token from 'markdown-it/lib/token'
import { convertMathMl2Math } from '@hungknguyen/docx-math-converter'
import katex from 'katex'

// Helper to convert LaTeX to Docx Math object using KaTeX -> MathML -> OMML
// This avoids the broken 'tex2mml' dependency in convertLatex2Math
const convertLatexToDocxMath = (latex: string) => {
    try {
        // 1. Convert LaTeX to MathML using KaTeX
        const mathml = katex.renderToString(latex, {
            output: 'mathml',
            throwOnError: false,
            displayMode: true // Ensure block display for correct OMML structure
        })

        // 2. Extract strictly the MathML part if KaTeX wraps it (KaTeX output is HTML + MathML usually)
        const mathMatch = mathml.match(/<math[\s\S]*?<\/math>/)
        if (!mathMatch) return [new TextRun(latex)]

        let cleanMathml = mathMatch[0]
        // Remove annotation tags which cause warnings in docx-math-converter
        cleanMathml = cleanMathml.replace(/<annotation[\s\S]*?<\/annotation>/g, '')

        // 3. Convert MathML to OMML
        return convertMathMl2Math(cleanMathml)
    } catch (e) {
        consola.error('Failed to convert latex to math', e)
        return [new TextRun(latex)]
    }
}

export class DocxGenerator {
    private md: MarkdownIt

    constructor() {
        this.md = new MarkdownIt({
            html: true
        })
        this.md.use(MarkdownItKatex)
    }

    async generate(markdown: string): Promise<Blob> {
        const tokens = this.md.parse(markdown, {})
        const children: (Paragraph | Table)[] = []

        let i = 0
        while (i < tokens.length) {
            const token = tokens[i]!

            if (token.type === 'heading_open') {
                const result = this.processHeading(tokens, i)
                children.push(result.paragraph)
                i = result.nextIndex
            } else if (token.type === 'paragraph_open') {
                const result = await this.processParagraph(tokens, i)
                if (result.paragraph) children.push(result.paragraph)
                i = result.nextIndex
            } else if (token.type === 'html_block') {
                const table = this.processHtmlBlockToken(token)
                if (table) children.push(table)
                i++
            } else if (token.type === 'math_block') {
                // Handle Block Math: $$ ... $$
                const mathObj = this.processMathBlock(token)
                children.push(mathObj)
                i++
            } else {
                i++
            }
        }

        const isChinese = this.detectDominantLanguage(markdown)

        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: {
                            font: isChinese ? 'Microsoft YaHei' : 'Arial',
                            characterSpacing: isChinese ? 20 : 0,
                        },
                    },
                },
            },
            sections: [{
                properties: {},
                children: children
            }]
        })

        return Packer.toBlob(doc)
    }

    private processMathBlock(token: Token): Paragraph {
        // Use new converter
        const mathChildren = convertLatexToDocxMath(token.content)

        // Wrap in a paragraph
        return new Paragraph({
            children: Array.isArray(mathChildren) ? mathChildren : [mathChildren],
            spacing: { after: 240 }
        })
    }

    private processHtmlBlockToken(token: Token): Table | null {
        // Simple HTML Table parser
        const content = token.content
        if (!content.includes('<table')) return null

        const rows: TableRow[] = []
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
        let rowMatch

        while ((rowMatch = rowRegex.exec(content)) !== null) {
            const rowContent = rowMatch[1]!
            const cells: TableCell[] = []

            // Match td or th
            const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/g
            let cellMatch
            while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
                // eslint-disable-next-line sonarjs/slow-regex -- Input is trusted local content, simple parsing needed
                const cellText = cellMatch[2]!.replace(/<[^>]+>/g, '').trim()
                const isHeader = cellMatch[1].toLowerCase() === 'th'
                cells.push(new TableCell({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: cellText,
                            bold: isHeader,
                        })]
                    })],
                    width: {
                        size: 100 / 2, // Assume 2 columns for now
                        type: WidthType.PERCENTAGE
                    },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 1 },
                        bottom: { style: BorderStyle.SINGLE, size: 1 },
                        left: { style: BorderStyle.SINGLE, size: 1 },
                        right: { style: BorderStyle.SINGLE, size: 1 },
                    }
                }))
            }
            if (cells.length > 0) {
                rows.push(new TableRow({ children: cells }))
            }
        }

        if (rows.length === 0) return null

        return new Table({
            rows: rows,
            width: {
                size: 100,
                type: WidthType.PERCENTAGE
            },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
                insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
                insideVertical: { style: BorderStyle.SINGLE, size: 1 },
            }
        })
    }

    private processHeading(tokens: Token[], index: number) {
        const openToken = tokens[index]!
        const inlineToken = tokens[index + 1]!

        const level = parseInt(openToken.tag.replace('h', ''))
        let headingLevel = HeadingLevel.HEADING_1
        if (level === 2) headingLevel = HeadingLevel.HEADING_2
        if (level === 3) headingLevel = HeadingLevel.HEADING_3
        if (level >= 4) headingLevel = HeadingLevel.HEADING_4

        return {
            paragraph: new Paragraph({
                text: inlineToken.content,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                heading: headingLevel as any
            }),
            nextIndex: index + 3
        }
    }

    private async processParagraph(tokens: Token[], index: number) {
        const contentToken = tokens[index + 1]!
        let paragraph: Paragraph | null = null

        if (contentToken.type === 'inline') {
            const imageToken = contentToken.children?.find(c => c.type === 'image')
            // If only one child and it's image
            if (contentToken.children?.length === 1 && imageToken) {
                const imageId = imageToken.attrGet('src')?.split(':')[1]
                if (imageId) {
                    paragraph = await this.createImageParagraph(imageId)
                }
            } else {
                paragraph = await this.createParagraph(contentToken)
            }
        }

        return { paragraph, nextIndex: index + 3 }
    }

    private async createParagraph(inlineToken: Token): Promise<Paragraph> {
        const children = await this.createParagraphChildren(inlineToken)

        return new Paragraph({
            children: children,
            spacing: {
                after: 240,
                line: 240,
                lineRule: 'auto',
            }
        })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async createParagraphChildren(inlineToken: Token): Promise<(TextRun | ImageRun | any)[]> {
        const runs: (TextRun | ImageRun | any)[] = []
        if (!inlineToken.children) {
            runs.push(new TextRun(inlineToken.content))
            return runs
        }

        let style = { bold: false, italic: false }

        for (const child of inlineToken.children) {
            if (this.updateStyle(child, style)) continue

            const result = await this.processInlineChild(child, style)
            if (result) {
                if (Array.isArray(result)) runs.push(...result)
                else runs.push(result)
            }
        }
        return runs
    }

    private updateStyle(child: Token, style: { bold: boolean, italic: boolean }): boolean {
        if (child.type === 'strong_open') { style.bold = true; return true }
        if (child.type === 'strong_close') { style.bold = false; return true }
        if (child.type === 'em_open') { style.italic = true; return true }
        if (child.type === 'em_close') { style.italic = false; return true }
        return false
    }

    private async processInlineChild(child: Token, style: { bold: boolean, italic: boolean }) {
        if (child.type === 'text') {
            return new TextRun({
                text: child.content,
                bold: style.bold,
                italics: style.italic
            })
        }

        if (child.type === 'softbreak' || child.type === 'hardbreak') {
            return new TextRun({ text: '', break: 1 })
        }

        if (child.type === 'image') {
            return this.createInlineImageRun(child)
        }

        if (child.type === 'math_inline') {
            return convertLatexToDocxMath(child.content)
        }

        return null
    }

    private async createInlineImageRun(child: Token): Promise<ImageRun | TextRun> {
        const imageId = child.attrGet('src')?.split(':')[1]
        if (!imageId) return new TextRun("[Missing Image ID]")

        try {
            const image = await db.getPageExtractedImage(imageId)
            if (image) {
                const buffer = image.blob instanceof Blob
                    ? await image.blob.arrayBuffer()
                    : image.blob
                return new ImageRun({
                    data: buffer,
                    type: 'png',
                    transformation: { width: 100, height: 100 }
                })
            }
        } catch (e) {
            consola.error(`[DocxGenerator] Failed to create inline image for ${imageId}`, e)
        }
        return new TextRun("[Missing Image]")
    }

    private async createImageParagraph(imageId: string): Promise<Paragraph | null> {
        try {
            const extractedImage = await db.getPageExtractedImage(imageId)
            if (!extractedImage) return null

            const buffer = extractedImage.blob instanceof Blob
                ? await extractedImage.blob.arrayBuffer()
                : extractedImage.blob

            return new Paragraph({
                children: [
                    new ImageRun({
                        data: buffer,
                        type: 'png',
                        transformation: {
                            width: 600,
                            height: 600
                        },
                    }),
                ],
            })
        } catch (error) {
            consola.error(`[DocxGenerator] Failed to create image paragraph for ${imageId}`, error)
            return null
        }
    }

    private detectDominantLanguage(text: string): boolean {
        // Remove common markdown syntax
        /* eslint-disable sonarjs/slow-regex */
        const cleanText = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]\([^)]*\)/g, '')
            .replace(/[#*`~> +\-=_]/g, '')
        /* eslint-enable sonarjs/slow-regex */

        const totalLength = cleanText.length
        if (totalLength === 0) return false

        // Count Chinese characters
        const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]/g)
        const chineseCount = chineseMatches ? chineseMatches.length : 0

        return (chineseCount / totalLength) > 0.2
    }
}

export const docxGenerator = new DocxGenerator()
