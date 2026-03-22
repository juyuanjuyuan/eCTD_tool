import React from 'react';
import { Editor } from '@tiptap/react';
import { Button, Space, Divider, Select, Tooltip, Dropdown } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  UndoOutlined,
  RedoOutlined,
  TableOutlined,
  PictureOutlined,
  AlignLeftOutlined,
  AlignCenterOutlined,
  AlignRightOutlined,
  MenuOutlined,
} from '@ant-design/icons';

// eCTD compliant font sizes (小四号=12pt, 五号=10.5pt)
const FONT_SIZES = [
  { label: '五号 (10.5pt)', value: '10.5pt' },
  { label: '小四 (12pt)', value: '12pt' },
  { label: '四号 (14pt)', value: '14pt' },
  { label: '小三 (15pt)', value: '15pt' },
  { label: '三号 (16pt)', value: '16pt' },
  { label: '小二 (18pt)', value: '18pt' },
  { label: '二号 (22pt)', value: '22pt' },
];

function getHeadingLevel(editor: Editor): number {
  for (let i = 1; i <= 6; i++) {
    if (editor.isActive('heading', { level: i })) return i;
  }
  return 0;
}

interface ToolbarProps {
  editor: Editor;
  onInsertImage?: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor, onInsertImage }) => {
  const tableMenuItems = [
    {
      key: 'insert',
      label: '插入 3×3 表格',
      onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      key: 'addColBefore',
      label: '在左侧插入列',
      onClick: () => editor.chain().focus().addColumnBefore().run(),
      disabled: !editor.can().addColumnBefore(),
    },
    {
      key: 'addColAfter',
      label: '在右侧插入列',
      onClick: () => editor.chain().focus().addColumnAfter().run(),
      disabled: !editor.can().addColumnAfter(),
    },
    {
      key: 'addRowBefore',
      label: '在上方插入行',
      onClick: () => editor.chain().focus().addRowBefore().run(),
      disabled: !editor.can().addRowBefore(),
    },
    {
      key: 'addRowAfter',
      label: '在下方插入行',
      onClick: () => editor.chain().focus().addRowAfter().run(),
      disabled: !editor.can().addRowAfter(),
    },
    { type: 'divider' as const },
    {
      key: 'deleteCol',
      label: '删除当前列',
      onClick: () => editor.chain().focus().deleteColumn().run(),
      disabled: !editor.can().deleteColumn(),
    },
    {
      key: 'deleteRow',
      label: '删除当前行',
      onClick: () => editor.chain().focus().deleteRow().run(),
      disabled: !editor.can().deleteRow(),
    },
    {
      key: 'deleteTable',
      label: '删除表格',
      danger: true,
      onClick: () => editor.chain().focus().deleteTable().run(),
      disabled: !editor.can().deleteTable(),
    },
    { type: 'divider' as const },
    {
      key: 'mergeCells',
      label: '合并单元格',
      onClick: () => editor.chain().focus().mergeCells().run(),
      disabled: !editor.can().mergeCells(),
    },
    {
      key: 'splitCell',
      label: '拆分单元格',
      onClick: () => editor.chain().focus().splitCell().run(),
      disabled: !editor.can().splitCell(),
    },
  ];

  return (
    <div className="editor-toolbar">
      <Space size={4} wrap>
        {/* Heading selector */}
        <Select
          value={getHeadingLevel(editor)}
          onChange={(level) => {
            if (level === 0) editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
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
          size="small"
        />

        {/* Font size selector */}
        <Select
          value="12pt"
          options={FONT_SIZES}
          style={{ width: 130 }}
          size="small"
          disabled
          title="eCTD 规范: 正文不小于小四号字(12pt)"
        />

        <Divider type="vertical" />

        {/* Text formatting */}
        <Tooltip title="加粗 (Ctrl+B)">
          <Button
            type={editor.isActive('bold') ? 'primary' : 'text'}
            icon={<BoldOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
        </Tooltip>
        <Tooltip title="斜体 (Ctrl+I)">
          <Button
            type={editor.isActive('italic') ? 'primary' : 'text'}
            icon={<ItalicOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
        </Tooltip>
        <Tooltip title="下划线 (Ctrl+U)">
          <Button
            type={editor.isActive('underline') ? 'primary' : 'text'}
            icon={<UnderlineOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          />
        </Tooltip>
        <Tooltip title="删除线">
          <Button
            type={editor.isActive('strike') ? 'primary' : 'text'}
            icon={<StrikethroughOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* Text alignment */}
        <Tooltip title="左对齐">
          <Button
            type={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'text'}
            icon={<AlignLeftOutlined />}
            size="small"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          />
        </Tooltip>
        <Tooltip title="居中">
          <Button
            type={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'text'}
            icon={<AlignCenterOutlined />}
            size="small"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          />
        </Tooltip>
        <Tooltip title="右对齐">
          <Button
            type={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'text'}
            icon={<AlignRightOutlined />}
            size="small"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* Lists */}
        <Tooltip title="有序列表">
          <Button
            type={editor.isActive('orderedList') ? 'primary' : 'text'}
            icon={<OrderedListOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
        </Tooltip>
        <Tooltip title="无序列表">
          <Button
            type={editor.isActive('bulletList') ? 'primary' : 'text'}
            icon={<UnorderedListOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
        </Tooltip>
        <Tooltip title="引用块">
          <Button
            type={editor.isActive('blockquote') ? 'primary' : 'text'}
            icon={<MenuOutlined />}
            size="small"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* Table */}
        <Dropdown menu={{ items: tableMenuItems }} trigger={['click']}>
          <Tooltip title="表格">
            <Button type="text" icon={<TableOutlined />} size="small" />
          </Tooltip>
        </Dropdown>

        {/* Image */}
        <Tooltip title="插入图片">
          <Button
            type="text"
            icon={<PictureOutlined />}
            size="small"
            onClick={onInsertImage}
          />
        </Tooltip>

        <Divider type="vertical" />

        {/* Undo/Redo */}
        <Tooltip title="撤销 (Ctrl+Z)">
          <Button
            type="text"
            icon={<UndoOutlined />}
            size="small"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          />
        </Tooltip>
        <Tooltip title="重做 (Ctrl+Shift+Z)">
          <Button
            type="text"
            icon={<RedoOutlined />}
            size="small"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
          />
        </Tooltip>
      </Space>
    </div>
  );
};

export default Toolbar;
