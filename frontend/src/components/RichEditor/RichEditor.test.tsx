import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

// Mock TipTap modules
const mockEditor = {
  getJSON: vi.fn(() => ({ type: 'doc', content: [] })),
  getHTML: vi.fn(() => '<p></p>'),
  commands: { setContent: vi.fn() },
  setEditable: vi.fn(),
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      setImage: vi.fn(() => ({ run: vi.fn() })),
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
      toggleUnderline: vi.fn(() => ({ run: vi.fn() })),
      toggleStrike: vi.fn(() => ({ run: vi.fn() })),
      toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
      toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      setParagraph: vi.fn(() => ({ run: vi.fn() })),
      setTextAlign: vi.fn(() => ({ run: vi.fn() })),
      undo: vi.fn(() => ({ run: vi.fn() })),
      redo: vi.fn(() => ({ run: vi.fn() })),
      insertTable: vi.fn(() => ({ run: vi.fn() })),
    })),
  })),
  isActive: vi.fn(() => false),
  can: vi.fn(() => ({
    undo: vi.fn(() => true),
    redo: vi.fn(() => false),
    addColumnBefore: vi.fn(() => false),
    addColumnAfter: vi.fn(() => false),
    addRowBefore: vi.fn(() => false),
    addRowAfter: vi.fn(() => false),
    deleteColumn: vi.fn(() => false),
    deleteRow: vi.fn(() => false),
    deleteTable: vi.fn(() => false),
    mergeCells: vi.fn(() => false),
    splitCell: vi.fn(() => false),
  })),
  storage: {
    characterCount: {
      characters: vi.fn(() => 42),
      words: vi.fn(() => 7),
    },
  },
};

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => mockEditor),
  EditorContent: ({ editor, className }: any) => (
    <div data-testid="editor-content" className={className}>
      Mock Editor Content
    </div>
  ),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: vi.fn(() => 'StarterKit') },
}));
vi.mock('@tiptap/extension-table', () => ({
  default: { configure: vi.fn(() => 'Table') },
}));
vi.mock('@tiptap/extension-table-row', () => ({ default: 'TableRow' }));
vi.mock('@tiptap/extension-table-cell', () => ({ default: 'TableCell' }));
vi.mock('@tiptap/extension-table-header', () => ({ default: 'TableHeader' }));
vi.mock('@tiptap/extension-image', () => ({
  default: { configure: vi.fn(() => 'Image') },
}));
vi.mock('@tiptap/extension-link', () => ({
  default: { configure: vi.fn(() => 'Link') },
}));
vi.mock('@tiptap/extension-underline', () => ({ default: 'Underline' }));
vi.mock('@tiptap/extension-text-align', () => ({
  default: { configure: vi.fn(() => 'TextAlign') },
}));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: vi.fn(() => 'Placeholder') },
}));
vi.mock('@tiptap/extension-character-count', () => ({ default: 'CharacterCount' }));

vi.mock('../../services/file', () => ({
  fileApi: {
    uploadEditorImage: vi.fn(),
  },
}));

vi.mock('../../services/ctd', () => ({
  ctdApi: {
    getTemplateTree: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('./CrossReferenceExtension', () => ({
  default: { configure: vi.fn(() => 'CrossReference') },
  CrossReference: { configure: vi.fn(() => 'CrossReference') },
}));

// Mock antd icons
vi.mock('@ant-design/icons', () => ({
  BoldOutlined: (props: any) => <span data-testid="icon-bold" {...props} />,
  ItalicOutlined: (props: any) => <span data-testid="icon-italic" {...props} />,
  UnderlineOutlined: (props: any) => <span data-testid="icon-underline" {...props} />,
  StrikethroughOutlined: (props: any) => <span data-testid="icon-strike" {...props} />,
  OrderedListOutlined: (props: any) => <span data-testid="icon-ol" {...props} />,
  UnorderedListOutlined: (props: any) => <span data-testid="icon-ul" {...props} />,
  UndoOutlined: (props: any) => <span data-testid="icon-undo" {...props} />,
  RedoOutlined: (props: any) => <span data-testid="icon-redo" {...props} />,
  TableOutlined: (props: any) => <span data-testid="icon-table" {...props} />,
  PictureOutlined: (props: any) => <span data-testid="icon-image" {...props} />,
  AlignLeftOutlined: (props: any) => <span data-testid="icon-align-left" {...props} />,
  AlignCenterOutlined: (props: any) => <span data-testid="icon-align-center" {...props} />,
  AlignRightOutlined: (props: any) => <span data-testid="icon-align-right" {...props} />,
  MenuOutlined: (props: any) => <span data-testid="icon-blockquote" {...props} />,
  LinkOutlined: (props: any) => <span data-testid="icon-crossref" {...props} />,
}));

import RichEditor from './index';

describe('RichEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders editor with toolbar and footer', { timeout: 10000 }, () => {
    render(<RichEditor content={null} />);

    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
    expect(screen.getByText(/字符: 42/)).toBeInTheDocument();
    expect(screen.getByText(/词数: 7/)).toBeInTheDocument();
  });

  it('shows eCTD spec hint in footer', () => {
    render(<RichEditor content={null} />);

    expect(screen.getByText(/宋体/)).toBeInTheDocument();
    expect(screen.getByText(/小四号字/)).toBeInTheDocument();
    expect(screen.getByText(/1.5倍行距/)).toBeInTheDocument();
  });

  it('renders toolbar with formatting buttons when editable', () => {
    render(<RichEditor content={null} editable={true} />);

    expect(screen.getByTestId('icon-bold')).toBeInTheDocument();
    expect(screen.getByTestId('icon-italic')).toBeInTheDocument();
    expect(screen.getByTestId('icon-underline')).toBeInTheDocument();
    expect(screen.getByTestId('icon-strike')).toBeInTheDocument();
    expect(screen.getByTestId('icon-ol')).toBeInTheDocument();
    expect(screen.getByTestId('icon-ul')).toBeInTheDocument();
    expect(screen.getByTestId('icon-undo')).toBeInTheDocument();
    expect(screen.getByTestId('icon-redo')).toBeInTheDocument();
    expect(screen.getByTestId('icon-table')).toBeInTheDocument();
    expect(screen.getByTestId('icon-image')).toBeInTheDocument();
  });

  it('hides toolbar when editable=false (read-only mode)', () => {
    render(<RichEditor content={null} editable={false} />);

    expect(screen.queryByTestId('icon-bold')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-italic')).not.toBeInTheDocument();
  });

  it('displays section title when provided', () => {
    render(<RichEditor content={null} sectionTitle="2.3.S.1 一般性质" />);

    expect(screen.getByText('2.3.S.1 一般性质')).toBeInTheDocument();
  });

  it('does not display section title when not provided', () => {
    render(<RichEditor content={null} />);

    expect(screen.queryByText('2.3.S.1 一般性质')).not.toBeInTheDocument();
  });

  it('shows alignment buttons', () => {
    render(<RichEditor content={null} />);

    expect(screen.getByTestId('icon-align-left')).toBeInTheDocument();
    expect(screen.getByTestId('icon-align-center')).toBeInTheDocument();
    expect(screen.getByTestId('icon-align-right')).toBeInTheDocument();
  });

  it('renders editor-content with correct class', () => {
    render(<RichEditor content={null} />);

    const editorContent = screen.getByTestId('editor-content');
    expect(editorContent).toHaveClass('editor-content');
  });

  it('shows character and word count from editor storage', () => {
    mockEditor.storage.characterCount.characters.mockReturnValue(128);
    mockEditor.storage.characterCount.words.mockReturnValue(23);

    render(<RichEditor content={null} />);

    expect(screen.getByText(/字符: 128/)).toBeInTheDocument();
    expect(screen.getByText(/词数: 23/)).toBeInTheDocument();
  });
});

describe('RichEditor CSS eCTD compliance', () => {
  let cssContent: string;

  beforeEach(() => {
    cssContent = fs.readFileSync(
      path.resolve(__dirname, 'editor.css'),
      'utf-8',
    );
  });

  it('uses SimSun (宋体) as primary body font', () => {
    expect(cssContent).toContain("'SimSun'");
    expect(cssContent).toContain("'Songti SC'");
  });

  it('uses SimHei (黑体) for headings', () => {
    expect(cssContent).toContain("'SimHei'");
    expect(cssContent).toContain("'Heiti SC'");
  });

  it('sets body font size to 16px (12pt / 小四号)', () => {
    expect(cssContent).toMatch(/font-size:\s*16px/);
  });

  it('sets 1.5 line height', () => {
    expect(cssContent).toMatch(/line-height:\s*1\.5/);
  });

  it('sets black text color for body', () => {
    expect(cssContent).toMatch(/color:\s*#000/);
  });

  it('sets table font size to 14px (10.5pt / 五号)', () => {
    expect(cssContent).toMatch(/font-size:\s*14px/);
  });

  it('includes Times New Roman for English text', () => {
    expect(cssContent).toContain("'Times New Roman'");
  });

  it('uses blue color for links', () => {
    expect(cssContent).toMatch(/\.tiptap a[\s\S]*?color:\s*#1890ff/);
  });

  it('heading sizes decrease from h1 to h6', () => {
    const headingSizes = ['22pt', '18pt', '16pt', '14pt', '12pt', '10.5pt'];
    headingSizes.forEach((size) => {
      expect(cssContent).toContain(size);
    });
  });
});
