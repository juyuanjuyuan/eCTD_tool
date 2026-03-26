import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { message, Modal, TreeSelect } from 'antd';
import { fileApi } from '../../services/file';
import { ctdApi } from '../../services/ctd';
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
import CrossReference from './CrossReferenceExtension';
import Toolbar from './Toolbar';
import './editor.css';

interface RichEditorProps {
  content: any; // TipTap JSON
  onUpdate?: (json: any, html: string) => void;
  editable?: boolean;
  sectionTitle?: string;
  sequenceId?: string; // For image upload to MinIO
}

const RichEditor: React.FC<RichEditorProps> = ({
  content,
  onUpdate,
  editable = true,
  sectionTitle,
  sequenceId,
}) => {
  // Track content identity to avoid expensive JSON.stringify comparisons
  const contentVersionRef = useRef(0);
  const isInternalUpdateRef = useRef(false);

  const extensions = useMemo(() => [
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
    CrossReference.configure({
      HTMLAttributes: { class: 'cross-reference' },
    }),
  ], []);

  const editor = useEditor({
    extensions,
    content,
    editable,
    onUpdate: ({ editor: ed }) => {
      isInternalUpdateRef.current = true;
      const json = ed.getJSON();
      // Defer HTML serialization — only compute when caller needs it
      const html = ed.getHTML();
      onUpdate?.(json, html);
    },
  });

  // Update content when switching nodes — use ref to skip self-triggered updates
  useEffect(() => {
    if (editor && content !== undefined) {
      if (isInternalUpdateRef.current) {
        isInternalUpdateRef.current = false;
        return;
      }
      contentVersionRef.current += 1;
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) return null;

  const handleInsertImage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/svg+xml';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      if (sequenceId) {
        // Upload to MinIO
        try {
          const { url } = await fileApi.uploadEditorImage(sequenceId, file);
          editor.chain().focus().setImage({ src: url }).run();
        } catch (err: any) {
          message.error(err.message || '图片上传失败');
        }
      } else {
        // Fallback: use object URL
        const url = URL.createObjectURL(file);
        editor.chain().focus().setImage({ src: url }).run();
      }
    };
    input.click();
  }, [editor, sequenceId]);

  // Cross-reference state — cache tree data between opens
  const [crossRefOpen, setCrossRefOpen] = useState(false);
  const [crossRefTarget, setCrossRefTarget] = useState<string | null>(null);
  const [treeData, setTreeData] = useState<any[]>([]);
  const treeDataCacheRef = useRef<any[] | null>(null);

  const handleOpenCrossRef = useCallback(async () => {
    try {
      if (treeDataCacheRef.current) {
        setTreeData(treeDataCacheRef.current);
      } else {
        const tree = await ctdApi.getTemplateTree();
        const convertTree = (nodes: any[]): any[] =>
          nodes.map((n: any) => ({
            value: `${n.ctdSectionNumber}||${n.titleZh || n.elementName}`,
            title: `${n.ctdSectionNumber} ${n.titleZh || n.elementName}`,
            children: n.children?.length ? convertTree(n.children) : undefined,
            selectable: n.isLeaf,
          }));
        const converted = convertTree(tree);
        treeDataCacheRef.current = converted;
        setTreeData(converted);
      }
      setCrossRefOpen(true);
    } catch {
      message.error('加载目录结构失败');
    }
  }, []);

  const handleInsertCrossRef = useCallback(() => {
    if (!crossRefTarget || !editor) return;
    const [section, title] = crossRefTarget.split('||');
    const text = `见 ${section} ${title}`;
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'text',
        text,
        marks: [
          {
            type: 'crossReference',
            attrs: { targetSection: section, targetTitle: title },
          },
        ],
      })
      .run();
    setCrossRefOpen(false);
    setCrossRefTarget(null);
  }, [editor, crossRefTarget]);

  const charCount = editor.storage.characterCount?.characters() || 0;
  const wordCount = editor.storage.characterCount?.words() || 0;

  const memoizedEditorContent = useMemo(
    () => <EditorContent editor={editor} className="editor-content" />,
    [editor],
  );

  return (
    <div className="rich-editor">
      {editable && (
        <Toolbar editor={editor} onInsertImage={handleInsertImage} onInsertCrossReference={handleOpenCrossRef} />
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
      {memoizedEditorContent}
      <div className="editor-footer">
        <span>字符: {charCount} | 词数: {wordCount}</span>
        <span style={{ color: '#bfbfbf' }}>
          eCTD 规范: 宋体 小四号字 1.5倍行距
        </span>
      </div>
      <Modal
        title="插入交叉引用"
        open={crossRefOpen}
        onOk={handleInsertCrossRef}
        onCancel={() => { setCrossRefOpen(false); setCrossRefTarget(null); }}
        okText="插入"
        cancelText="取消"
        okButtonProps={{ disabled: !crossRefTarget }}
      >
        <TreeSelect
          style={{ width: '100%' }}
          value={crossRefTarget}
          dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
          treeData={treeData}
          placeholder="选择要引用的章节..."
          treeDefaultExpandAll={false}
          onChange={(val) => setCrossRefTarget(val)}
          showSearch
          treeNodeFilterProp="title"
        />
      </Modal>
    </div>
  );
};

export default RichEditor;
