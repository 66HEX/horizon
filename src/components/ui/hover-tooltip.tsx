import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, Code, Book, Database, Package } from "lucide-react"

export type ContentType = 'function' | 'struct' | 'variable' | 'module' | 'generic'

export type DocumentationMetadata = {
  has_code_blocks: boolean
  has_tables: boolean
  has_lists: boolean
  content_type: ContentType
  warning_messages: string[]
}

export type EnhancedHoverData = {
  title: string
  signature: string | null
  documentation: string | null
  source_code: string | null
  raw: string
  metadata: DocumentationMetadata
}

const hoverVariants = cva(
  "absolute z-50 shadow-lg w-[476px] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
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

interface EnhancedHoverTooltipProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof hoverVariants> {
  data: EnhancedHoverData
  position: { top: number; left: number }
  onClose?: () => void
  maxHeight?: number
  maxWidth?: number
}

const getContentTypeIcon = (type: ContentType) => {
  switch (type) {
    case 'function':
      return <Code className="w-4 h-4" />
    case 'struct':
      return <Database className="w-4 h-4" />
    case 'variable':
      return <Package className="w-4 h-4" />
    case 'module':
      return <Book className="w-4 h-4" />
    default:
      return null
  }
}

const EnhancedHoverTooltip = React.forwardRef<HTMLDivElement, EnhancedHoverTooltipProps>(
  ({ className, variant, data, position, onClose, maxHeight = 400, maxWidth = 628, ...props }, ref) => {
    const cardRef = React.useRef<HTMLDivElement>(null)
    const [calculatedPosition, setCalculatedPosition] = React.useState(position)

    React.useEffect(() => {
      if (cardRef.current) {
        const rect = cardRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const padding = 10
        
        let newLeft = position.left
        let newTop = position.top
        
        if (position.left + rect.width > viewportWidth - padding) {
          newLeft = Math.max(padding, viewportWidth - rect.width - padding)
        }
        
        if (position.top + rect.height > viewportHeight - padding) {
          newTop = Math.max(padding, position.top - rect.height - padding)
        }
        
        newLeft = Math.max(padding, Math.min(newLeft, viewportWidth - rect.width - padding))
        newTop = Math.max(padding, Math.min(newTop, viewportHeight - rect.height - padding))
        
        setCalculatedPosition({ top: newTop, left: newLeft })
      }
    }, [position, data])

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (cardRef.current && !cardRef.current.contains(event.target as Node) && onClose) {
          onClose()
        }
      }
      
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [onClose])

    React.useEffect(() => {
      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && onClose) {
          onClose()
        }
      }
      
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }, [onClose])

    const markdownStyles = {
      h1: "text-lg font-bold mt-3 mb-2",
      h2: "text-base font-semibold mt-2 mb-1",
      h3: "text-sm font-semibold mt-2 mb-1",
      h4: "text-sm font-medium mt-1 mb-1",
      h5: "text-xs font-medium mt-1 mb-1",
      h6: "text-xs font-medium mt-1 mb-1",
      
      p: "text-sm text-primary/90 my-1 w-md max-w-[600px]",
      a: "text-primary hover:text-primary/80",
      strong: "text-primary/90 font-bold",
      em: "text-primary/90 italic",
      
      ul: "text-sm text-primary/90 list-disc pl-4 my-1",
      ol: "text-sm text-primary/90 list-decimal pl-4 my-1",
      li: "text-sm text-primary/90 my-0.5",
      
      pre: "bg-muted/80 rounded my-2 p-2 w-md max-w-[600px] overflow-x-auto",
      code: "font-mono text-xs bg-muted/80 px-1 py-0.5 rounded text-primary/50 w-md max-w-[600px] overflow-x-auto",
      inlineCode: "font-mono text-xs bg-[#232323] px-1 py-0.5 rounded text-primary/50",
      
      blockquote: "border-l-2 border-primary/20 pl-3 italic my-2 text-primary/80",
      hr: "border-t border-border my-2",
      
      tableWrapper: "overflow-x-auto my-2 rounded border border-border",
      table: "w-full border-collapse text-xs border border-border",
      thead: "bg-muted/30",
      tbody: "text-primary/90",
      tr: "border-b border-border",
      th: "px-3 py-2 font-medium text-left border-r border-border last:border-r-0 bg-muted/50",
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
        <Card ref={cardRef} className="overflow-hidden">
          <ScrollArea className="relative w-full" style={{ maxHeight: `${maxHeight}px` }}>
            <div className="p-3 pb-2 flex items-center gap-2 max-w-[476px]">
              {getContentTypeIcon(data.metadata.content_type)}
              <h4 className="font-semibold text-sm flex-1 truncate">{data.title}</h4>
              <span className="text-xs text-muted-foreground">
                {data.metadata.content_type}
              </span>
            </div>
            
            {data.metadata.warning_messages && data.metadata.warning_messages.length > 0 && (
              <>
                <Separator />
                <div className="p-3">
                  {data.metadata.warning_messages.map((message, index) => (
                    <Alert key={index} variant="destructive" className="mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warning</AlertTitle>
                      <AlertDescription>{message}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              </>
            )}
            
            {data.documentation && (
              <>
                <Separator />
                <div className="p-3 markdown-content">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className={markdownStyles.h1}>{children}</h1>,
                      h2: ({ children }) => <h2 className={markdownStyles.h2}>{children}</h2>,
                      h3: ({ children }) => <h3 className={markdownStyles.h3}>{children}</h3>,
                      h4: ({ children }) => <h4 className={markdownStyles.h4}>{children}</h4>,
                      h5: ({ children }) => <h5 className={markdownStyles.h5}>{children}</h5>,
                      h6: ({ children }) => <h6 className={markdownStyles.h6}>{children}</h6>,
                      p: ({ children }) => <p className={markdownStyles.p}>{children}</p>,
                      a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className={markdownStyles.a}
                        >
                          {children}
                        </a>
                      ),
                      img: ({ src, alt }) => {
                        if (src?.includes('badge') || src?.includes('shield') || alt?.includes('badge')) {
                          return (
                            <img
                              src={src}
                              alt={alt || ''}
                              className="inline-block mx-1 h-5 align-text-bottom"
                              style={{ maxHeight: '20px' }}
                            />
                          );
                        }
                        
                        return (
                          <img
                            src={src}
                            alt={alt || ''}
                            className="max-w-full my-2 rounded"
                          />
                        );
                      },
                      strong: ({ children }) => <strong className={markdownStyles.strong}>{children}</strong>,
                      em: ({ children }) => <em className={markdownStyles.em}>{children}</em>,
                      ul: ({ children }) => <ul className={markdownStyles.ul}>{children}</ul>,
                      ol: ({ children }) => <ol className={markdownStyles.ol}>{children}</ol>,
                      li: ({ children }) => <li className={markdownStyles.li}>{children}</li>,
                      code: ({ children }) => (
                        <code className={markdownStyles.inlineCode}>
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className={markdownStyles.pre}>
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => <blockquote className={markdownStyles.blockquote}>{children}</blockquote>,
                      hr: ({ children }) => <hr className={markdownStyles.hr}>{children}</hr>,
                      table: ({ children }) => (
                        <div className={markdownStyles.tableWrapper}>
                          <table className={markdownStyles.table}>
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className={markdownStyles.thead}>{children}</thead>,
                      tbody: ({ children }) => <tbody className={markdownStyles.tbody}>{children}</tbody>,
                      tr: ({ children }) => <tr className={markdownStyles.tr}>{children}</tr>,
                      th: ({ children }) => <th className={markdownStyles.th}>{children}</th>,
                      td: ({ children }) => <td className={markdownStyles.td}>{children}</td>,
                    }}
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                  >
                    {data.documentation}
                  </ReactMarkdown>
                </div>
              </>
            )}
            
            
            {/* Debug info in development mode */}
            {process.env.NODE_ENV === 'development' && (
              <>
                <Separator />
                <div className="p-3 bg-muted/10">
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium mb-1">Debug Info</summary>
                    <pre className="bg-muted/20 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify({
                        ...data.metadata,
                        title: data.title,
                        signature_length: data.signature?.length,
                        doc_length: data.documentation?.length,
                        code_length: data.source_code?.length,
                        raw_preview: data.raw.substring(0, 100) + '...'
                      }, null, 2)}
                    </pre>
                  </details>
                </div>
              </>
            )}
          </ScrollArea>
        </Card>
      </div>
    )
  }
)

EnhancedHoverTooltip.displayName = "EnhancedHoverTooltip"

export { EnhancedHoverTooltip }