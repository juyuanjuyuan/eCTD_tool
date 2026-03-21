# TipTap 富文本编辑器集成

## 1. 安装依赖

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
npm install @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header
npm install @tiptap/extension-image @tiptap/extension-link
npm install @tiptap/extension-underline @tiptap/extension-text-align
npm install @tiptap/extension-placeholder @tiptap/extension-character-count
```

## 2. 基础编辑器组件

```tsx
// components/RichEditor/index.tsx
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
import { Toolbar } from './Toolbar';

interface RichEditorProps {
  content: any; // TipTap JSON
  onUpdate: (json: any, html: string) => void;
  editable?: boolean;
}

export const RichEditor = ({ content, onUpdate, editable = true }: RichEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ allowBase64: false }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: '请输入内容...' }),
      CharacterCount,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const html = editor.getHTML();
      onUpdate(json, html);
    },
  });

  if (!editor) return null;

  return (
    <div className="rich-editor">
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-content" />
      <div className="editor-footer">
        字数: {editor.storage.characterCount.characters()}
      </div>
    </div>
  );
};
```

## 3. 工具栏组件

```tsx
// components/RichEditor/Toolbar.tsx
import { Editor } from '@tiptap/react';
import { Button, Space, Divider, Select, Tooltip } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  OrderedListOutlined, UnorderedListOutlined, UndoOutlined, RedoOutlined,
  TableOutlined, PictureOutlined, LinkOutlined,
} from '@ant-design/icons';

export const Toolbar = ({ editor }: { editor: Editor }) => {
  return (
    <div className="editor-toolbar">
      <Space size={4} wrap>
        {/* 标题选择 */}
        <Select
          value={getHeadingLevel(editor)}
          onChange={(level) => {
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level }).run();
          }}
          options={[
            { label: '正文', value: 0 },
            { label: '标题 1', value: 1 },
            { label: '标题 2', value: 2 },
            { label: '标题 3', value: 3 },
            { label: '标题 4', value: 4 },
            { label: '标题 5', value: 5 },
            { label: '标题 6', value: 6 },
          ]}
          style={{ width: 100 }}
        />

        <Divider type="vertical" />

        {/* 文字格式 */}
        <Tooltip title="加粗">
          <Button
            type={editor.isActive('bold') ? 'primary' : 'text'}
            icon={<BoldOutlined />}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
        </Tooltip>
        <Tooltip title="斜体">
          <Button
            type={editor.isActive('italic') ? 'primary' : 'text'}
            icon={<ItalicOutlined />}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        </Tooltip>
        <Tooltip title="下划线">
          <Button
            type={editor.isActive('underline') ? 'primary' : 'text'}
            icon={<UnderlineOutlined />}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* 列表 */}
        <Tooltip title="有序列表">
          <Button
            type={editor.isActive('orderedList') ? 'primary' : 'text'}
            icon={<OrderedListOutlined />}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </Tooltip>
        <Tooltip title="无序列表">
          <Button
            type={editor.isActive('bulletList') ? 'primary' : 'text'}
            icon={<UnorderedListOutlined />}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* 表格 */}
        <Tooltip title="插入表格">
          <Button
            type="text"
            icon={<TableOutlined />}
            onClick={() => editor.chain().focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          />
        </Tooltip>

        {/* 图片 */}
        <Tooltip title="插入图片">
          <Button
            type="text"
            icon={<PictureOutlined />}
            onClick={() => handleInsertImage(editor)}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* 撤销/重做 */}
        <Tooltip title="撤销">
          <Button
            type="text"
            icon={<UndoOutlined />}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          />
        </Tooltip>
        <Tooltip title="重做">
          <Button
            type="text"
            icon={<RedoOutlined />}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          />
        </Tooltip>
      </Space>
    </div>
  );
};
```

## 4. 自动保存 Hook

```tsx
// hooks/useAutoSave.ts
import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { documentApi } from '@/services/document';
import { useEditorStore } from '@/stores/editor';

export const useAutoSave = (nodeId: string) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const { setDirty } = useEditorStore();

  const saveMutation = useMutation({
    mutationFn: (data: { contentJson: any; contentHtml: string }) =>
      documentApi.save(nodeId, data),
    onSuccess: () => setDirty(false),
  });

  const debouncedSave = useCallback(
    (contentJson: any, contentHtml: string) => {
      setDirty(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        saveMutation.mutate({ contentJson, contentHtml });
      }, 3000); // 3秒防抖
    },
    [nodeId],
  );

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return {
    onUpdate: debouncedSave,
    isSaving: saveMutation.isPending,
    saveStatus: saveMutation.isPending ? '保存中...' : useEditorStore.getState().isDirty ? '未保存' : '已保存',
  };
};
```

## 5. 图片上传处理

```tsx
// 图片上传至 MinIO
const handleInsertImage = async (editor: Editor) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fileApi.uploadImage(formData);
    editor.chain().focus().setImage({ src: res.data.url }).run();
  };
  input.click();
};
```

## 6. 编辑器样式

```css
/* components/RichEditor/editor.css */
.rich-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid #e8e8e8;
  background: #fafafa;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 48px;
}

.editor-content .ProseMirror {
  outline: none;
  min-height: 100%;
  font-family: 'SimSun', 'Times New Roman', serif;
  font-size: 14px;
  line-height: 1.8;
}

.editor-content .ProseMirror h1 { font-size: 22px; font-family: 'SimHei', sans-serif; }
.editor-content .ProseMirror h2 { font-size: 18px; font-family: 'SimHei', sans-serif; }
.editor-content .ProseMirror h3 { font-size: 16px; font-family: 'SimHei', sans-serif; }

.editor-content .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
}
.editor-content .ProseMirror td, .editor-content .ProseMirror th {
  border: 1px solid #ddd;
  padding: 8px;
}

.editor-footer {
  padding: 4px 12px;
  border-top: 1px solid #e8e8e8;
  font-size: 12px;
  color: #999;
}
```
