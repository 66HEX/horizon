import { create } from 'zustand';
import { createFileSlice } from '@/lib/stores/file-store/file-slice';
import { createDirectorySlice } from '@/lib/stores/file-store/directory-slice';
import { createUISlice } from '@/lib/stores/file-store/ui-slice';
import { createClipboardSlice } from '@/lib/stores/file-store/clipboard-slice';
import { createUtilitySlice } from '@/lib/stores/file-store/utility-slice';
import { FileStore } from '@/lib/stores/file-store/types';

/**
 * Main store combining all slices
 * @returns Combined store with all functionality
 */
export const useFileStore = create<FileStore>()((...a) => ({
  ...createFileSlice(...a),
  ...createDirectorySlice(...a),
  ...createUISlice(...a),
  ...createClipboardSlice(...a),
  ...createUtilitySlice(...a),
}));

/**
 * Export types for easier import in components
 */
export * from './types';