import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import Toolbar from './Toolbar';
import './editor.css';

interface RichEditorProps {
  content: any; // TipTap JSON
  onUpdate?: (json: any, html: string) => void;
  editable?: boolean;
  sectionTitle?: string;
}

const RichEditor: React.FC<RichEditorProps> = ({
  content,
  onUpdate,
  editable = true,
  sectionTitle,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'ectd-table' },
      }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'ectd-image' },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: '请输入内容...',
      }),
      CharacterCount,
    ],
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      const html = ed.getHTML();
      onUpdate?.(json, html);
    },
  });

  // Update content when switching nodes
  useEffect(() => {
    if (editor && content !== undefined) {
      const currentJson = JSON.stringify(editor.getJSON());
      const newJson = JSON.stringify(content);
      if (currentJson !== newJson) {
        editor.commands.setContent(content || '');
      }
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) return null;

  const handleInsertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      // For now, use object URL. MinIO integration will come in plan_6
      const url = URL.createObjectURL(file);
      editor.chain().focus().setImage({ src: url }).run();
    };
    input.click();
  };

  const charCount = editor.storage.characterCount?.characters() || 0;
  const wordCount = editor.storage.characterCount?.words() || 0;

  return (
    <div className="rich-editor">
      {editable && (
        <Toolbar editor={editor} onInsertImage={handleInsertImage} />
      )}
      {sectionTitle && (
        <div style={{
          padding: '8px 48px 0',
          fontSize: '12px',
          color: '#8c8c8c',
          background: '#fff',
        }}>
          {sectionTitle}
        </div>
      )}
      <EditorContent editor={editor} className="editor-content" />
      <div className="editor-footer">
        <span>字符: {charCount} | 词数: {wordCount}</span>
        <span style={{ color: '#bfbfbf' }}>
          eCTD 规范: 宋体 小四号字 1.5倍行距
        </span>
      </div>
    </div>
  );
};

export default RichEditor;
