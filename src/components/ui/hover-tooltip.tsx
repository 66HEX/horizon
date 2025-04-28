"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Definicja typów danych hover
export type FormattedHoverData = {
  title: string
  signature: string | null
  documentation: string | null
  source_code: string | null
  raw: string
}

// Warianty stylu tooltipa
const hoverVariants = cva(
  "absolute z-50 max-w-md shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "bg-background border rounded-md overflow-hidden",
        error: "bg-destructive text-destructive-foreground border-destructive rounded-md",
        warning: "bg-warning text-warning-foreground border-warning rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface HoverTooltipProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof hoverVariants> {
  data: FormattedHoverData
  position: { top: number; left: number }
  onClose?: () => void
  maxHeight?: number
  maxWidth?: number
}

const HoverTooltip = React.forwardRef<HTMLDivElement, HoverTooltipProps>(
  ({ className, variant, data, position, onClose, maxHeight = 300, maxWidth = 500, ...props }, ref) => {
    // Referencja do karty
    const cardRef = React.useRef<HTMLDivElement>(null)
    
    // Rekalkulacja pozycji, aby tooltip nie wychodził poza ekran
    const [calculatedPosition, setCalculatedPosition] = React.useState(position)
    
    React.useEffect(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        
        let newLeft = position.left
        let newTop = position.top
        
        // Sprawdź, czy tooltip wychodzi poza prawy brzeg ekranu
        if (position.left + rect.width > viewportWidth) {
          newLeft = Math.max(0, viewportWidth - rect.width - 10)
        }
        
        // Sprawdź, czy tooltip wychodzi poza dolny brzeg ekranu
        if (position.top + rect.height > viewportHeight) {
          newTop = Math.max(0, position.top - rect.height)
        }
        
        setCalculatedPosition({ top: newTop, left: newLeft })
      }
    }, [position, data])
    
    // Zamknij tooltip przy kliknięciu poza nim
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (cardRef.current && !cardRef.current.contains(event.target as Node) && onClose) {
          onClose()
        }
      }
      
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [onClose])
    
    // Styl dla kontenera Markdown
    const markdownStyles = {
      // Style dla nagłówków
      h1: "text-xl font-semibold mt-2 mb-1",
      h2: "text-lg font-semibold mt-2 mb-1",
      h3: "text-base font-semibold mt-2 mb-1",
      h4: "text-sm font-semibold mt-1 mb-1",
      h5: "text-xs font-semibold mt-1 mb-1",
      h6: "text-xs font-semibold mt-1 mb-1",
      
      // Style dla paragrafów i tekstu
      p: "text-primary/90 my-1",
      a: "text-primary/90 underline",
      strong: "text-primary/90 font-bold",
      em: "text-primary/90 italic",
      
      // Style dla list
      ul: "text-primary/90 list-disc pl-4 my-1",
      ol: "text-primary/90 list-decimal pl-4 my-1",
      li: "text-primary/90 my-0.5",
      
      // Style dla bloków kodu i inline kodu
      pre: "bg-muted px-1 py-0.5 rounded my-2 overflow-x-auto inline",
      code: "font-mono text-xs bg-muted px-1 py-0.5 rounded",
      inlineCode: "font-mono text-xs bg-muted/80 px-1 py-0.5 rounded inline",
      
      // Style dla innych elementów
      blockquote: "border-l-2 border-muted pl-2 italic my-2",
      hr: "border-t my-2",
      
      // Ulepszone style dla tabel
      tableWrapper: "overflow-x-auto my-2 rounded border border-border",
      table: "w-full border-collapse text-xs",
      thead: "bg-muted/50",
      tbody: "text-primary/90 bg-background",
      tr: "border-b border-border last:border-0",
      th: "px-3 py-2 font-medium text-left border-r border-border last:border-r-0 whitespace-nowrap",
      td: "px-3 py-2 border-r border-border last:border-r-0 align-top",
    }
    
    return (
      <div
        ref={ref}
        className={cn(hoverVariants({ variant }), className)}
        style={{
          position: 'absolute',
          top: `${calculatedPosition.top}px`,
          left: `${calculatedPosition.left}px`,
          maxWidth: `${maxWidth}px`,
        }}
        {...props}
      >
        <Card ref={cardRef} className="max-w-md max-h-96 relative overflow-hidden">
          <ScrollArea className="relative w-full max-h-96">
            <div className="p-3 pb-3">
              <h4 className="font-semibold text-sm">{data.title}</h4>
              {data.signature && (
                <pre className="mt-1 text-xs bg-muted p-1 rounded">
                  <code>{data.signature}</code>
                </pre>
              )}
            </div>
            
            {data.documentation && (
              <>
                <Separator />
                <div className="text-xs markdown-content p-3 pb-3 max-w-md">
                  <ReactMarkdown
                    components={{
                      h1: ({ node, ...props }) => <h1 className={markdownStyles.h1} {...props} />,
                      h2: ({ node, ...props }) => <h2 className={markdownStyles.h2} {...props} />,
                      h3: ({ node, ...props }) => <h3 className={markdownStyles.h3} {...props} />,
                      h4: ({ node, ...props }) => <h4 className={markdownStyles.h4} {...props} />,
                      h5: ({ node, ...props }) => <h5 className={markdownStyles.h5} {...props} />,
                      h6: ({ node, ...props }) => <h6 className={markdownStyles.h6} {...props} />,
                      p: ({ node, ...props }) => <p className={markdownStyles.p} {...props} />,
                      a: ({ node, ...props }) => <a className={markdownStyles.a} {...props} />,
                      strong: ({ node, ...props }) => <strong className={markdownStyles.strong} {...props} />,
                      em: ({ node, ...props }) => <em className={markdownStyles.em} {...props} />,
                      ul: ({ node, ...props }) => <ul className={markdownStyles.ul} {...props} />,
                      ol: ({ node, ...props }) => <ol className={markdownStyles.ol} {...props} />,
                      li: ({ node, ...props }) => <li className={markdownStyles.li} {...props} />,
                      pre: ({ node, ...props }) => <pre className={markdownStyles.pre} {...props} />,
                      code: ({ node, inline, className, children, ...props }: any) => {
                        // Extract language info if it exists (language-xxx in className)
                        const match = /language-(\w+)/.exec(className || '');
                        const language = match ? match[1] : '';
                        
                        return !inline ? (
                          <pre className={markdownStyles.pre}>
                            <code 
                              className={cn(className, language && `language-${language}`)} 
                              data-language={language || undefined}
                              {...props}
                            >
                              {children}
                            </code>
                          </pre>
                        ) : (
                          <code className={markdownStyles.inlineCode} {...props}>
                            {children}
                          </code>
                        )
                      },
                      blockquote: ({ node, ...props }) => <blockquote className={markdownStyles.blockquote} {...props} />,
                      hr: ({ node, ...props }) => <hr className={markdownStyles.hr} {...props} />,
                      table: ({ node, ...props }) => (
                        <div className={markdownStyles.tableWrapper}>
                          <table className={markdownStyles.table} {...props} />
                        </div>
                      ),
                      thead: ({ node, ...props }) => <thead className={markdownStyles.thead} {...props} />,
                      tbody: ({ node, ...props }) => <tbody className={markdownStyles.tbody} {...props} />,
                      tr: ({ node, ...props }) => <tr className={markdownStyles.tr} {...props} />,
                      th: ({ node, ...props }) => <th scope="col" className={markdownStyles.th} {...props} />,
                      td: ({ node, ...props }) => <td className={markdownStyles.td} {...props} />,
                    }}
                    remarkPlugins={[remarkGfm]}
                  >
                    {data.documentation}
                  </ReactMarkdown>
                </div>
              </>
            )}
            
            {data.source_code && (
              <>
                <Separator />
                <pre className="text-xs p-3 max-w-md">
                  <code>{data.source_code}</code>
                </pre>
              </>
            )}
          </ScrollArea>
        </Card>
      </div>
    )
  }
)

HoverTooltip.displayName = "HoverTooltip"

export { HoverTooltip } 