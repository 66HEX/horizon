declare module 'react-markdown' {
  import { ReactNode } from 'react';

  export interface ReactMarkdownProps {
    children: string;
    remarkPlugins?: any[];
    components?: {
      [key: string]: React.ComponentType<any>;
    };
  }

  const ReactMarkdown: React.ComponentType<ReactMarkdownProps>;
  export default ReactMarkdown;
} 