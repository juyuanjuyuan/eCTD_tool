import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload,
  Table,
  Button,
  Tag,
  Space,
  Tooltip,
  Progress,
  Modal,
  message,
  Popconfirm,
  Typography,
  Empty,
} from 'antd';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  LinkOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  WarningFilled,
  CloseCircleFilled,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { fileApi, type FileAttachment, type ReferenceableFile } from '../services/file';

const { Text } = Typography;

const ALLOWED_EXTENSIONS = ['.pdf', '.xml', '.xpt', '.txt', '.xsl'];

function formatSize(sizeStr: string): string {
  const size = parseInt(sizeStr, 10);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getComplianceTag(status?: string) {
  switch (status) {
    case 'PASS':
      return <Tag icon={<CheckCircleFilled />} color="success" style={{ margin: 0 }}>合规</Tag>;
    case 'WARNING':
      return <Tag icon={<WarningFilled />} color="warning" style={{ margin: 0 }}>警告</Tag>;
    case 'ERROR':
      return <Tag icon={<CloseCircleFilled />} color="error" style={{ margin: 0 }}>错误</Tag>;
    default:
      return null;
  }
}

function getFileIcon(fileType: string) {
  switch (fileType) {
    case '.pdf':
      return <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
    case '.xml':
    case '.xsl':
      return <FileTextOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
    default:
      return <FileOutlined style={{ fontSize: 18 }} />;
  }
}

function stripExtension(name: string, ext: string): string {
  if (ext && name.toLowerCase().endsWith(ext.toLowerCase())) {
    return name.substring(0, name.length - ext.length);
  }
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.substring(0, dot) : name;
}

interface FilePanelProps {
  nodeId: string;
  isLeaf: boolean;
}

const FilePanel: React.FC<FilePanelProps> = ({ nodeId, isLeaf }) => {
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const fakeProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileAttachment | null>(null);
  const [refModalOpen, setRefModalOpen] = useState(false);
  const [refFiles, setRefFiles] = useState<ReferenceableFile[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!nodeId || !isLeaf) return;
    setLoading(true);
    try {
      const data = await fileApi.list(nodeId);
      setFiles(data);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [nodeId, isLeaf]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Minimum visible duration for the upload status panel. Under local-storage
  // (Electron desktop) uploads finish in tens of milliseconds — without an
  // animated floor the dragger flickers and user perceives "nothing happened".
  // 2500ms is long enough that even a distracted user can't miss it.
  const MIN_UPLOAD_VISIBLE_MS = 2500;

  const stopFakeProgress = useCallback(() => {
    if (fakeProgressTimerRef.current) {
      clearInterval(fakeProgressTimerRef.current);
      fakeProgressTimerRef.current = null;
    }
  }, []);

  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    const f = file as File;
    setUploading(true);
    setUploadProgress(0);
    setUploadingFileName(f.name);
    const startedAt = Date.now();
    // Smooth fake-progress animation so localhost uploads still show motion.
    // Real onUploadProgress (axios) overrides this if it fires meaningful values.
    stopFakeProgress();
    fakeProgressTimerRef.current = setInterval(() => {
      setUploadProgress((p) => {
        if (p >= 90) return p;            // hold at 90 until real success
        const step = p < 50 ? 6 : p < 80 ? 3 : 1;
        return Math.min(90, p + step);
      });
    }, 80);
    try {
      const newFile = await fileApi.upload(nodeId, f, (percent) => {
        // Real progress only takes over if it's higher than current fake value.
        setUploadProgress((p) => Math.max(p, Math.min(90, percent)));
      });
      // Ensure the panel is visible long enough to be perceptible.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_UPLOAD_VISIBLE_MS) {
        await new Promise((r) => setTimeout(r, MIN_UPLOAD_VISIBLE_MS - elapsed));
      }
      stopFakeProgress();
      setUploadProgress(100);
      message.success(`${f.name} 上传成功`);
      onSuccess?.({});
      // Optimistic insert — the new attachment appears in the list immediately
      // without waiting for the loadFiles() round-trip. Dedupe by id in case
      // loadFiles races and returns it too.
      if (newFile && (newFile as any).id) {
        setFiles((prev) => {
          if (prev.some((p) => p.id === (newFile as any).id)) return prev;
          return [newFile as any, ...prev];
        });
      }
      // Hold the 100% bar briefly so the user sees the completion state.
      await new Promise((r) => setTimeout(r, 350));
      loadFiles();
    } catch (err: any) {
      stopFakeProgress();
      message.error(err.message || '上传失败');
      onError?.(err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
    }
  };

  useEffect(() => () => stopFakeProgress(), [stopFakeProgress]);

  const handleDelete = async (fileId: string) => {
    try {
      await fileApi.delete(nodeId, fileId);
      message.success('文件已删除');
      loadFiles();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const { url, originalName } = await fileApi.download(nodeId, fileId);
      const a = document.createElement('a');
      a.href = url;
      a.download = originalName;
      a.click();
    } catch (err: any) {
      message.error(err.message || '下载失败');
    }
  };

  const handlePreview = async (fileId: string) => {
    try {
      const { url } = await fileApi.preview(nodeId, fileId);
      window.open(url, '_blank');
    } catch (err: any) {
      message.error(err.message || '预览失败');
    }
  };

  const showComplianceDetails = (file: FileAttachment) => {
    setSelectedFile(file);
    setComplianceModalOpen(true);
  };

  const openReferenceModal = async () => {
    setRefModalOpen(true);
    setRefLoading(true);
    try {
      const data = await fileApi.listReferenceable(nodeId);
      setRefFiles(data);
    } catch (err: any) {
      message.error(err.message || '加载可引用文件失败');
    } finally {
      setRefLoading(false);
    }
  };

  const handleCreateRef = async (sourceFileId: string) => {
    try {
      await fileApi.createReference(nodeId, sourceFileId);
      message.success('文件引用创建成功');
      setRefModalOpen(false);
      loadFiles();
    } catch (err: any) {
      message.error(err.message || '创建引用失败');
    }
  };

  const handleExportNameSave = async (file: FileAttachment, nextBase: string) => {
    const trimmed = nextBase.trim();
    const currentBase = file.exportName ?? stripExtension(file.storedName, file.fileType);
    if (trimmed === currentBase) return;
    try {
      // Empty string clears the override and falls back to the original stored name.
      await fileApi.updateExportName(nodeId, file.id, trimmed === '' ? null : trimmed);
      message.success(trimmed === '' ? '已恢复为上传时的文件名' : '导出名已更新');
      loadFiles();
    } catch (err: any) {
      message.error(err.message || '保存失败');
    }
  };

  const beforeUpload = (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      message.error(`不支持的文件类型 ${ext}。仅允许: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return Upload.LIST_IGNORE;
    }
    const maxSize = ext === '.xpt' ? 4 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error(`文件大小超过限制 (${ext === '.xpt' ? '4GB' : '500MB'})`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  if (!isLeaf) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#8c8c8c' }}>
        请选择叶节点查看文件
      </div>
    );
  }

  // File table columns
  const columns: ColumnsType<FileAttachment> = [
    {
      title: '文件',
      key: 'name',
      render: (_, file) => (
        <Space size={10}>
          {getFileIcon(file.fileType)}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13, lineHeight: '20px' }}>
              {file.originalName}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatSize(file.fileSize)}
              {file.isReference && (
                <Tag color="blue" style={{ fontSize: 10, marginLeft: 6, padding: '0 4px', lineHeight: '16px' }}>
                  引用
                </Tag>
              )}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: (
        <Tooltip title="eCTD 导出时使用的文件名（仅 a-z 0-9 - _），留空则使用上传时的文件名">
          <span>导出名</span>
        </Tooltip>
      ),
      key: 'exportName',
      width: 220,
      render: (_, file) => {
        if (file.isReference) {
          return <Text type="secondary" style={{ fontSize: 12 }}>引用文件不可改名</Text>;
        }
        const currentBase = file.exportName ?? stripExtension(file.storedName, file.fileType);
        const isCustom = !!file.exportName;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <Text
              editable={{
                tooltip: '点击编辑导出名',
                onChange: (value) => handleExportNameSave(file, value),
                maxLength: 64 - file.fileType.length,
              }}
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: isCustom ? '#262626' : '#8c8c8c',
                margin: 0,
                flex: 1,
                minWidth: 0,
              }}
            >
              {currentBase}
            </Text>
            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace', flexShrink: 0 }}>
              {file.fileType}
            </Text>
          </div>
        );
      },
    },
    {
      title: '合规',
      key: 'compliance',
      width: 100,
      align: 'center',
      render: (_, file) => {
        if (!file.pdfAnalysis) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>;
        const tag = getComplianceTag(file.pdfAnalysis.complianceStatus);
        if (file.pdfAnalysis.complianceStatus !== 'PASS') {
          return (
            <Tooltip title="查看合规详情">
              <span style={{ cursor: 'pointer' }} onClick={() => showComplianceDetails(file)}>
                {tag}
              </span>
            </Tooltip>
          );
        }
        return tag;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      align: 'center',
      render: (_, file) => (
        <Space size={4}>
          {file.fileType === '.pdf' && (
            <Tooltip title="预览">
              <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(file.id)} />
            </Tooltip>
          )}
          <Tooltip title="下载">
            <Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(file.id)} />
          </Tooltip>
          <Popconfirm title="确认删除此文件？" onConfirm={() => handleDelete(file.id)}>
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* Upload area — Dragger is ALWAYS mounted (avoids antd Upload internal
          state churn from unmount-during-upload) and the progress panel is
          rendered as an overlay on top via absolute positioning. */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Upload.Dragger
          customRequest={handleUpload}
          beforeUpload={beforeUpload}
          showUploadList={false}
          multiple={false}
          disabled={uploading}
          style={{
            padding: '20px 0',
            borderRadius: 8,
            background: '#fafafa',
          }}
        >
          <div style={{ padding: '8px 0' }}>
            <CloudUploadOutlined style={{ fontSize: 36, color: '#1890ff', marginBottom: 12 }} />
            <p style={{ margin: '0 0 4px', fontSize: 15, color: '#262626' }}>
              点击或拖拽文件到此区域上传
            </p>
            <p style={{ margin: 0, fontSize: 13, color: '#8c8c8c' }}>
              支持格式: {ALLOWED_EXTENSIONS.join('  ')}，单文件最大 500MB（XPT 4GB）
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#ff4d4f', fontWeight: 500 }}>
              请将文件改成英文名称
            </p>
          </div>
        </Upload.Dragger>
        {uploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 8,
              background: 'rgba(230, 244, 255, 0.97)',
              border: '1px dashed #1890ff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              justifyContent: 'center',
              padding: '16px 24px',
              zIndex: 5,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <CloudUploadOutlined
                style={{ fontSize: 22, color: '#1890ff', marginRight: 10 }}
                spin={uploadProgress < 100}
              />
              <Text style={{ fontSize: 14, fontWeight: 500, color: '#0958d9' }}>
                {uploadProgress < 100 ? '正在上传' : '上传完成'}：{uploadingFileName}
              </Text>
            </div>
            <Progress
              percent={uploadProgress}
              strokeColor="#1890ff"
              status={uploadProgress < 100 ? 'active' : 'success'}
            />
          </div>
        )}
      </div>

      {/* Actions bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <Text strong style={{ fontSize: 14 }}>
          已上传文件 {files.length > 0 && <Text type="secondary" style={{ fontWeight: 400 }}>({files.length})</Text>}
        </Text>
        <Button
          size="small"
          icon={<LinkOutlined />}
          onClick={openReferenceModal}
        >
          引用前序文件
        </Button>
      </div>

      {/* File table */}
      {files.length === 0 && !loading ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">暂无文件，请上传申报资料</Text>}
          style={{ margin: '40px 0' }}
        />
      ) : (
        <Table
          dataSource={files}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="middle"
          showHeader={files.length > 0}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Compliance Detail Modal */}
      <Modal
        title="PDF 合规检查结果"
        open={complianceModalOpen}
        onCancel={() => setComplianceModalOpen(false)}
        footer={null}
        width={640}
      >
        {selectedFile?.pdfAnalysis && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
              <div style={{ flex: 1 }}>
                <Text strong style={{ fontSize: 14 }}>{selectedFile.originalName}</Text>
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    PDF {selectedFile.pdfAnalysis.pdfVersion} &middot; {selectedFile.pdfAnalysis.pageCount} 页 &middot; {formatSize(selectedFile.fileSize)}
                  </Text>
                </div>
              </div>
              {getComplianceTag(selectedFile.pdfAnalysis.complianceStatus)}
            </div>

            {selectedFile.pdfAnalysis.complianceDetails?.errors?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Text strong style={{ color: '#ff4d4f', display: 'block', marginBottom: 10, fontSize: 14 }}>
                  错误 ({selectedFile.pdfAnalysis.complianceDetails.errors.length})
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={selectedFile.pdfAnalysis.complianceDetails.errors}
                  rowKey="ruleId"
                  columns={[
                    { title: '规则', dataIndex: 'ruleId', width: 70 },
                    { title: '描述', dataIndex: 'message' },
                    { title: '详情', dataIndex: 'detail', ellipsis: true, width: 180 },
                  ]}
                />
              </div>
            )}

            {selectedFile.pdfAnalysis.complianceDetails?.warnings?.length > 0 && (
              <div>
                <Text strong style={{ color: '#faad14', display: 'block', marginBottom: 10, fontSize: 14 }}>
                  警告 ({selectedFile.pdfAnalysis.complianceDetails.warnings.length})
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={selectedFile.pdfAnalysis.complianceDetails.warnings}
                  rowKey="ruleId"
                  columns={[
                    { title: '规则', dataIndex: 'ruleId', width: 70 },
                    { title: '描述', dataIndex: 'message' },
                  ]}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* File Reference Modal */}
      <Modal
        title="引用前序序列文件"
        open={refModalOpen}
        onCancel={() => setRefModalOpen(false)}
        footer={null}
        width={720}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          从同一申请的前序序列中引用已有文件，避免重复上传
        </Text>
        <Table
          size="small"
          loading={refLoading}
          dataSource={refFiles}
          rowKey="id"
          locale={{ emptyText: '无可引用的文件（需要前序序列且状态非草稿）' }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          columns={[
            {
              title: '序列',
              dataIndex: 'sequenceNumber',
              width: 80,
              render: (v: string) => <Tag style={{ margin: 0 }}>{v}</Tag>,
            },
            {
              title: '章节',
              dataIndex: 'sectionNumber',
              width: 90,
            },
            {
              title: '文件名',
              dataIndex: 'originalName',
              ellipsis: true,
            },
            {
              title: '大小',
              dataIndex: 'fileSize',
              width: 90,
              render: (v: string) => formatSize(v),
            },
            {
              title: '操作',
              width: 80,
              align: 'center',
              render: (_: any, record: ReferenceableFile) => (
                <Button type="link" size="small" onClick={() => handleCreateRef(record.id)}>
                  引用
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default FilePanel;
