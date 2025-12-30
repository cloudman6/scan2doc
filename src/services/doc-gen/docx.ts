import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } from 'docx'
import { db } from '@/db'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

export class DocxGenerator {
    private md: MarkdownIt

    constructor() {
        this.md = new MarkdownIt()
    }

    /**
     * Generate a DOCX blob from a Markdown string.
     * 
     * @param markdown The Markdown content
     * @param options Additional options for document styling
     * @returns A promise that resolves to a DOCX Blob
     */
    async generate(markdown: string): Promise<Blob> {
        const tokens = this.md.parse(markdown, {})
        const children: Paragraph[] = []

        // Basic transformation loop
        // Note: This is a simplified version, focusing on common Markdown elements.
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i]!

            if (token.type === 'heading_open') {
                const level = parseInt(token.tag.slice(1)) as any
                const contentToken = tokens[++i]!
                children.push(this.createHeading(contentToken.content, level))
                i++ // skip heading_close
            } else if (token.type === 'paragraph_open') {
                const contentToken = tokens[++i]!
                if (contentToken.type === 'inline') {
                    // Check for images in inline children
                    const imageToken = contentToken.children?.find(c => c.type === 'image')
                    if (imageToken) {
                        const imageId = imageToken.attrGet('src')?.split(':')[1]
                        if (imageId) {
                            const paragraph = await this.createImageParagraph(imageId)
                            if (paragraph) children.push(paragraph)
                        }
                    } else {
                        children.push(this.createParagraph(contentToken))
                    }
                }
                i++ // skip paragraph_close
            }
            // More types like lists, tables, images will be added
        }

        const doc = new Document({
            sections: [{
                properties: {},
                children: children
            }]
        })

        return await Packer.toBlob(doc)
    }

    private createHeading(text: string, level: number): Paragraph {
        let headingLevel: any = HeadingLevel.HEADING_1
        if (level === 2) headingLevel = HeadingLevel.HEADING_2
        if (level === 3) headingLevel = HeadingLevel.HEADING_3
        if (level === 4) headingLevel = HeadingLevel.HEADING_4
        if (level === 5) headingLevel = HeadingLevel.HEADING_5
        if (level === 6) headingLevel = HeadingLevel.HEADING_6

        return new Paragraph({
            text,
            heading: headingLevel
        })
    }

    private createParagraph(inlineToken: Token): Paragraph {
        const textRuns: TextRun[] = []

        if (inlineToken.children) {
            let bold = false
            let italic = false

            for (const child of inlineToken.children) {
                if (child.type === 'strong_open') bold = true
                else if (child.type === 'strong_close') bold = false
                else if (child.type === 'em_open') italic = true
                else if (child.type === 'em_close') italic = false
                else if (child.type === 'text') {
                    textRuns.push(new TextRun({
                        text: child.content,
                        bold,
                        italics: italic
                    }))
                } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
                    textRuns.push(new TextRun({ text: '', break: 1 }))
                }
            }
        } else {
            textRuns.push(new TextRun(inlineToken.content))
        }

        return new Paragraph({
            children: textRuns
        })
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
                            width: 400, // TODO: Maintain aspect ratio or use box info
                            height: 300,
                        },
                    }),
                ],
            })
        } catch (error) {
            console.error(`[DocxGenerator] Failed to create image paragraph for ${imageId}`, error)
            return null
        }
    }
}

export const docxGenerator = new DocxGenerator()
