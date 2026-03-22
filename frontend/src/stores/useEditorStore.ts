import { create } from 'zustand';
import type { SequenceNode, Document } from '../types';

interface EditorState {
  // Current selected node
  selectedNode: SequenceNode | null;
  setSelectedNode: (node: SequenceNode | null) => void;

  // Document content
  document: Document | null;
  setDocument: (doc: Document | null) => void;

  // Dirty state (unsaved changes)
  isDirty: boolean;
  setDirty: (dirty: boolean) => void;

  // Save status
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'error';
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved' | 'error') => void;

  // Editor panel collapsed states
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  selectedNode: null,
  setSelectedNode: (node) => set({ selectedNode: node }),

  document: null,
  setDocument: (doc) => set({ document: doc }),

  isDirty: false,
  setDirty: (dirty) => set({ isDirty: dirty }),

  saveStatus: 'saved',
  setSaveStatus: (status) => set({ saveStatus: status }),

  leftCollapsed: false,
  rightCollapsed: false,
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
}));
