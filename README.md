# Horizon

<div align="center">

> ⚠️ **Note:** This project is currently under active development and may contain bugs or incomplete features. Use at your own risk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.0-blue.svg)](https://tailwindcss.com)
[![CodeMirror](https://img.shields.io/badge/CodeMirror-6-blue.svg)](https://codemirror.net)

[![GitHub stars](https://img.shields.io/github/stars/66HEX/horizon?style=social)](https://github.com/66HEX/horizon/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/66HEX/horizon?style=social)](https://github.com/66HEX/horizon/network/members)
[![GitHub issues](https://img.shields.io/github/issues/66HEX/horizon)](https://github.com/66HEX/horizon/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/66HEX/horizon)](https://github.com/66HEX/horizon/pulls)

[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/66HEX/horizon/releases)
[![Downloads](https://img.shields.io/github/downloads/66HEX/horizon/total)](https://github.com/66HEX/horizon/releases)
[![Release](https://img.shields.io/github/release/66HEX/horizon)](https://github.com/66HEX/horizon/releases/latest)

![Horizon Editor Screenshot](screen.png)

</div>


## Features

### Core Editor
- Application powered by Tauri
- Syntax highlighting for multiple programming languages
- UI built with Tailwind CSS and Radix UI components
- File and content search capabilities
- File system integration with directory navigation
- Integrated terminal with multi-instance support
- Dark theme for long coding sessions

### Terminal Integration
- Terminal implementation with native process management
- Support for multiple concurrent terminal instances
- Process tracking and management
- Persistent command history for improved workflow
- Cross-platform compatibility (Windows, macOS, Linux)
- Working directory synchronization
- Signal handling (SIGINT, SIGTERM)
- URL detection and handling
- ANSI escape sequence processing

### File Management
- File tree navigation system
- File and content search functionality
- File operations (open, save, save as)
- Directory structure representation
- Image file preview capabilities
- Audio file player
- Multiple file tab management

## Tech Stack

### Frontend
- React 18
- TypeScript
- Tailwind CSS
- Radix UI
- ShadCN
- CodeMirror 6

### Backend (Tauri/Rust)
- Tauri 2.0
- Rust
- sysinfo for process tracking
- tauri-plugin-fs for file system operations
- tauri-plugin-shell for terminal integration
- tauri-plugin-dialog for native dialogs
- tauri-plugin-process for process management

## Getting Started

### Prerequisites
- Node.js (Latest LTS version)
- Rust (Latest stable version)
- Tauri CLI

### Installation

1. Clone the repository:
```bash
git clone https://github.com/66HEX/horizon.git
cd horizon
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run tauri dev
```

### Building for Production
```bash
npm run tauri build
```

## Project Structure

```
horizon/
├── src/                           # Frontend source code (React/TypeScript)
│   ├── components/                # React components
│   │   ├── app-sidebar.tsx        # File navigation sidebar
│   │   ├── audio-player.tsx       # Audio playback component
│   │   ├── code-editor.tsx        # Main code editor integration
│   │   ├── create-dialog.tsx      # File/folder creation dialog
│   │   ├── image-viewer.tsx       # Image preview component
│   │   ├── rename-dialog.tsx      # File/folder rename dialog
│   │   ├── terminal.tsx           # Terminal emulator component
│   │   ├── theme-provider.tsx     # Theme management
│   │   └── ui/                    # UI component library
│   │       ├── button.tsx         # Button component
│   │       ├── card.tsx           # Card container component
│   │       ├── context-menu.tsx   # Context menu component
│   │       ├── dialog.tsx         # Dialog component
│   │       ├── dropdown-menu.tsx  # Dropdown menu component
│   │       ├── file-selection-tabs.tsx # File tabs component
│   │       ├── hover-tooltip.tsx  # LSP hover information tooltip
│   │       ├── resizable.tsx      # Resizable panels component
│   │       ├── scroll-area.tsx    # Scrollable container component
│   │       ├── sidebar.tsx        # Sidebar component
│   │       ├── tabs.tsx           # Tabs container component
│   │       └── ... (additional UI components)
│   │
│   ├── lib/                       # Core frontend functionality
│   │   ├── file-context.tsx       # File context provider
│   │   ├── file-service.ts        # File operations service
│   │   ├── lsp-store.ts           # LSP state management
│   │   ├── native-fs.ts           # Native filesystem bindings
│   │   ├── stores.ts              # State management stores
│   │   └── utils.ts               # Utility functions
│   │
│   ├── hooks/                     # Custom React hooks
│   │   ├── use-mobile.ts          # Mobile detection hook
│   │   └── use-theme.ts           # Theme management hook
│   │
│   ├── app/                       # Application-specific code
│   ├── assets/                    # Static assets
│   ├── App.tsx                    # Main application component
│   ├── App.css                    # Global styles
│   └── main.tsx                   # Application entry point
│
├── src-tauri/                     # Backend source code (Rust)
│   ├── src/                       # Rust source files
│   │   ├── lsp/                   # Language Server Protocol implementation
│   │   │   ├── mod.rs             # LSP module definition
│   │   │   ├── protocol.rs        # LSP protocol handlers
│   │   │   ├── server_factory.rs  # LSP server factory
│   │   │   ├── websocket.rs       # WebSocket server implementation
│   │   │   ├── config.rs          # LSP configuration
│   │   │   ├── logger.rs          # Logging functionality
│   │   │   └── servers/           # Language-specific server implementations
│   │   │       ├── rust.rs        # Rust language server
│   │   │       └── mod.rs         # Server module definitions
│   │   │
│   │   ├── fs.rs                  # Filesystem operations
│   │   ├── terminal.rs            # Terminal implementation
│   │   ├── process_tracker.rs     # Process monitoring
│   │   ├── lib.rs                 # Library definition
│   │   └── main.rs                # Application entry point
│   │
│   ├── Cargo.toml                 # Rust dependencies
│   ├── tauri.conf.json            # Tauri configuration 
│   ├── capabilities/              # Tauri capabilities configuration
│   └── icons/                     # Application icons
│
├── public/                        # Static public assets
├── dist/                          # Build output directory
├── node_modules/                  # Node.js dependencies
├── package.json                   # Node.js package configuration
├── tsconfig.json                  # TypeScript configuration
├── vite.config.ts                 # Vite bundler configuration
└── README.md                      # Project documentation
```

### Key Component Relationships

1. **Frontend-Backend Communication**
   - `native-fs.ts` → interfaces with Rust's `fs.rs` for filesystem operations
   - `lsp-store.ts` → communicates with `lsp/websocket.rs` for LSP functionality
   - `stores.ts` → manages terminal state linked to `terminal.rs`

2. **Editor Architecture**
   - `code-editor.tsx` → integrates CodeMirror 6 with LSP functionality
   - `App.tsx` → orchestrates layout and main component interactions
   - `file-service.ts` → provides high-level file operations API

3. **State Management Flow**
   - `file-context.tsx` → provides global file state
   - `stores.ts` → manages application state with Zustand
   - `lsp-store.ts` → handles LSP-specific state management

4. **UI Component Hierarchy**
   - Base UI components (button, card, etc.) → used by composite components
   - `app-sidebar.tsx` → uses file context to display file tree
   - `terminal.tsx` → manages terminal sessions and UI

## Roadmap

### Short-Term Priorities (0-6 months)

#### Core Stability and Performance
- [ ] File watching for external changes detection
- [ ] Progress indicators for long-running file operations
- [ ] Optimized large directory scanning with virtualization
- [ ] Enhanced error handling and recovery for file operations
- [ ] Terminal performance optimization for large outputs
- [ ] Buffering system for fast terminal output streams
- [ ] Improved ANSI escape sequence handling and colors
- [ ] Complete Rust LSP integration with rust-analyzer
- [ ] TypeScript/JavaScript LSP integration
- [ ] Basic Python LSP support
- [ ] Resource usage monitoring and limits
- [ ] Memory optimization for large files and projects

#### User Experience Enhancements
- [ ] Drag and drop support for file operations
- [ ] File previews for additional file types
- [ ] Enhanced search capabilities with filtering options
- [ ] Terminal session management and tabs improvements
- [ ] Command history search functionality
- [ ] Automatic command completion for terminal
- [ ] Customizable terminal appearance (fonts, colors)
- [ ] Improved syntax highlighting consistency
- [ ] Editor status indicators for LSP and processes
- [ ] Keyboard shortcut system with documentation
- [ ] Customizable editor themes
- [ ] Enhanced error and warning visualization
- [ ] Settings panel with comprehensive configuration options

### Medium-Term Priorities (6-12 months)

#### Advanced Development Features
- [ ] Batch file operations functionality
- [ ] File comparison utility
- [ ] File recovery from temporary backups
- [ ] Persistent search indexes for improved performance
- [ ] Split terminal views
- [ ] Full xterm.js terminal integration
- [ ] Terminal profiles and configurations
- [ ] Git integration with GitHub support
- [ ] Branch visualization and management
- [ ] Diff viewer and conflict resolution
- [ ] Extended LSP support for Go, C/C++, and Java
- [ ] Code actions and refactorings
- [ ] Semantic token highlighting

#### Ecosystem and Extensibility
- [ ] Extensions and plugins system architecture
- [ ] Extension management and marketplace
- [ ] Multiple workspace support
- [ ] Project templates and scaffolding
- [ ] Build system integration
- [ ] Task running and management system
- [ ] Global symbol search functionality
- [ ] Advanced code navigation between files
- [ ] Cross-language references
- [ ] GitHub Actions autobuild pipeline

### Long-Term Vision (12+ months)

#### Collaborative and Cloud Features
- [ ] SSH/SFTP connection support
- [ ] Remote workspace editing
- [ ] Container-based development environments
- [ ] Real-time collaborative editing
- [ ] Presence indicators and cursor sharing
- [ ] Settings and preferences synchronization
- [ ] Project and workspace sync between devices

#### AI and Advanced Intelligence
- [ ] AI-powered chat assistant for code help
- [ ] Context-aware code suggestions
- [ ] Automated documentation generation
- [ ] Code quality recommendations
- [ ] AI-assisted refactorings and transformations
- [ ] Code quality metrics and visualization
- [ ] Project dependency analysis
- [ ] Interactive tutorials and code walkthroughs
- [ ] Debugging support with breakpoints and variable inspection

#### Additional Enhancements
- [ ] Additional theme support and customization
- [ ] Advanced code refactoring tools
- [ ] Comprehensive performance optimization
- [ ] Documentation improvements
- [ ] Integrated project management system
- [ ] Advanced data visualization features
- [ ] Code presentation mode for meetings and recordings

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Tauri team for the excellent desktop framework
- CodeMirror team for the powerful editor framework
- All contributors and supporters of the project 