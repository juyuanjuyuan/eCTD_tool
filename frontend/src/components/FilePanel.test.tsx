import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import FilePanel from './FilePanel';

// Mock the file API
vi.mock('../services/file', () => ({
  fileApi: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    download: vi.fn(),
    preview: vi.fn(),
    listReferenceable: vi.fn(),
    createReference: vi.fn(),
  },
}));

// Mock antd message
vi.mock('antd', async () => {
  const actual = await vi.importActual('antd');
  return {
    ...actual,
    message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { fileApi } from '../services/file';

const mockList = fileApi.list as ReturnType<typeof vi.fn>;

describe('FilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  it('shows message for non-leaf nodes', () => {
    render(<FilePanel nodeId="node-1" isLeaf={false} />);

    expect(screen.getByText('请选择叶节点查看文件')).toBeInTheDocument();
  });

  it('renders upload area for leaf nodes', async () => {
    const { container } = render(<FilePanel nodeId="node-1" isLeaf={true} />);

    await waitFor(() => {
      // Upload.Dragger renders with ant-upload-drag class
      expect(container.querySelector('.ant-upload-drag')).toBeInTheDocument();
    });
    // Check the "已上传文件" heading is present
    expect(screen.getByText(/已上传文件/)).toBeInTheDocument();
  }, 15000);

  it('renders reference button for leaf nodes', () => {
    render(<FilePanel nodeId="node-1" isLeaf={true} />);

    expect(screen.getByText('引用前序文件')).toBeInTheDocument();
  });

  it('loads files on mount for leaf nodes', async () => {
    mockList.mockResolvedValue([
      {
        id: 'file-1',
        sequenceNodeId: 'node-1',
        originalName: 'test-document.pdf',
        storedName: 'test-document.pdf',
        storagePath: '/path/to/file',
        ectdRelativePath: 'm1/cn/test-document.pdf',
        fileType: '.pdf',
        fileSize: '1048576',
        md5Checksum: 'abc123',
        xmlLang: 'zh',
        isReference: false,
        referenceFileId: null,
        uploadedBy: null,
        createdAt: '2026-03-23',
      },
    ]);

    render(<FilePanel nodeId="node-1" isLeaf={true} />);

    await waitFor(() => {
      expect(mockList).toHaveBeenCalledWith('node-1');
    });

    await waitFor(() => {
      // Ant Design renders the filename in multiple nested elements
      const matches = screen.getAllByText((content) =>
        content.includes('test-document.pdf'),
      );
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('does not load files when not a leaf', () => {
    render(<FilePanel nodeId="node-1" isLeaf={false} />);

    expect(mockList).not.toHaveBeenCalled();
  });

  it('shows empty state when no files', async () => {
    mockList.mockResolvedValue([]);

    render(<FilePanel nodeId="node-1" isLeaf={true} />);

    await waitFor(() => {
      expect(screen.getByText(/暂无文件/)).toBeInTheDocument();
    });
  });

  it('shows reference tag for referenced files', async () => {
    mockList.mockResolvedValue([
      {
        id: 'file-ref',
        sequenceNodeId: 'node-1',
        originalName: 'referenced-file.pdf',
        storedName: 'referenced-file.pdf',
        storagePath: '/path/ref',
        ectdRelativePath: 'm1/cn/referenced-file.pdf',
        fileType: '.pdf',
        fileSize: '2048',
        md5Checksum: 'def456',
        xmlLang: 'zh',
        isReference: true,
        referenceFileId: 'original-file-1',
        uploadedBy: null,
        createdAt: '2026-03-23',
      },
    ]);

    render(<FilePanel nodeId="node-1" isLeaf={true} />);

    await waitFor(() => {
      expect(screen.getByText('引用')).toBeInTheDocument();
    });
  });
});
