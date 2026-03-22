import React, { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  List,
  Button,
  Tag,
  Space,
  Tooltip,
  Progress,
  Modal,
  Table,
  message,
  Popconfirm,
  Badge,
  Typography,
  Empty,
} from 'antd';
import {
  UploadOutlined,
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
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { fileApi, type FileAttachment, type ReferenceableFile } from '../services/file';

const { Text } = Typography;

/** Allowed eCTD file extensions */
const ALLOWED_EXTENSIONS = ['.pdf', '.xml', '.xpt', '.txt', '.xsl'];

/** Format file size from string (bytes) to human-readable */
function formatSize(sizeStr: string): string {
  const size = parseInt(sizeStr, 10);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Get compliance status icon */
function getComplianceIcon(status?: string) {
  switch (status) {
    case 'PASS':
      return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />;
    case 'WARNING':
      return <WarningFilled style={{ color: '#faad14', fontSize: 14 }} />;
    case 'ERROR':
      return <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 14 }} />;
    default:
      return null;
  }
}

/** Get file icon */
function getFileIcon(fileType: string) {
  switch (fileType) {
    case '.pdf':
      return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    case '.xml':
    case '.xsl':
      return <FileTextOutlined style={{ color: '#1890ff' }} />;
    default:
      return <FileOutlined />;
  }
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
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileAttachment | null>(null);
  const [refModalOpen, setRefModalOpen] = useState(false);
  const [refFiles, setRefFiles] = useState<ReferenceableFile[]>([]);
  const [refLoading, setRefLoading] = useState(false);

  // Load files
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

  // Upload handler
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    setUploading(true);
    setUploadProgress(0);
    try {
      await fileApi.upload(nodeId, file as File, (percent) => {
        setUploadProgress(percent);
      });
      message.success('文件上传成功');
      onSuccess?.({});
      loadFiles();
    } catch (err: any) {
      message.error(err.message || '上传失败');
      onError?.(err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Delete file
  const handleDelete = async (fileId: string) => {
    try {
      await fileApi.delete(nodeId, fileId);
      message.success('文件已删除');
      loadFiles();
    } catch (err: any) {
      message.error(err.message || '删除失败');
    }
  };

  // Download file
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

  // Preview file
  const handlePreview = async (fileId: string) => {
    try {
      const { url } = await fileApi.preview(nodeId, fileId);
      window.open(url, '_blank');
    } catch (err: any) {
      message.error(err.message || '预览失败');
    }
  };

  // Show compliance details
  const showComplianceDetails = (file: FileAttachment) => {
    setSelectedFile(file);
    setComplianceModalOpen(true);
  };

  // Open reference modal
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

  // Create reference
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

  // Validate before upload
  const beforeUpload = (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      message.error(`不支持的文件类型 ${ext}。仅允许: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return Upload.LIST_IGNORE;
    }
    // Size check: 200MB for non-xpt, 4GB for xpt
    const maxSize = ext === '.xpt' ? 4 * 1024 * 1024 * 1024 : 200 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error(`文件大小超过限制 (${ext === '.xpt' ? '4GB' : '200MB'})`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  if (!isLeaf) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#8c8c8c' }}>
        请选择叶节点查看文件
      </div>
    );
  }

  return (
    <div style={{ padding: '0 12px' }}>
      {/* Upload area */}
      <Upload.Dragger
        customRequest={handleUpload}
        beforeUpload={beforeUpload}
        showUploadList={false}
        multiple={false}
        disabled={uploading}
        style={{ marginBottom: 12 }}
      >
        <p style={{ margin: 0, fontSize: 13 }}>
          <UploadOutlined style={{ marginRight: 4 }} />
          点击或拖拽文件上传
        </p>
        <p style={{ margin: 0, fontSize: 11, color: '#8c8c8c' }}>
          支持: {ALLOWED_EXTENSIONS.join(', ')}
        </p>
      </Upload.Dragger>

      {/* Upload progress */}
      {uploading && (
        <Progress percent={uploadProgress} size="small" style={{ marginBottom: 8 }} />
      )}

      {/* Reference button */}
      <Button
        size="small"
        icon={<LinkOutlined />}
        onClick={openReferenceModal}
        style={{ marginBottom: 12 }}
        block
      >
        引用前序序列文件
      </Button>

      {/* File list */}
      <List
        size="small"
        loading={loading}
        dataSource={files}
        locale={{ emptyText: <Empty description="暂无文件" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        renderItem={(file) => (
          <List.Item
            style={{ padding: '6px 0' }}
            actions={[
              file.fileType === '.pdf' && (
                <Tooltip key="preview" title="预览">
                  <Button
                    type="text"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handlePreview(file.id)}
                  />
                </Tooltip>
              ),
              <Tooltip key="download" title="下载">
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleDownload(file.id)}
                />
              </Tooltip>,
              <Popconfirm
                key="delete"
                title="确认删除此文件？"
                onConfirm={() => handleDelete(file.id)}
              >
                <Tooltip title="删除">
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={
                <Badge
                  count={
                    file.pdfAnalysis
                      ? getComplianceIcon(file.pdfAnalysis.complianceStatus)
                      : file.isReference
                        ? <LinkOutlined style={{ color: '#1890ff', fontSize: 12 }} />
                        : undefined
                  }
                  offset={[-2, 2]}
                >
                  {getFileIcon(file.fileType)}
                </Badge>
              }
              title={
                <Space size={4} style={{ width: '100%' }}>
                  <Text
                    style={{ fontSize: 12, maxWidth: 140 }}
                    ellipsis={{ tooltip: file.originalName }}
                  >
                    {file.originalName}
                  </Text>
                  {file.isReference && (
                    <Tag color="blue" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                      引用
                    </Tag>
                  )}
                  {file.pdfAnalysis && file.pdfAnalysis.complianceStatus !== 'PASS' && (
                    <Tooltip title="查看合规详情">
                      <Button
                        type="text"
                        size="small"
                        icon={<InfoCircleOutlined style={{ fontSize: 12 }} />}
                        onClick={() => showComplianceDetails(file)}
                        style={{ padding: 0, height: 'auto' }}
                      />
                    </Tooltip>
                  )}
                </Space>
              }
              description={
                <Space size={8} style={{ fontSize: 11 }}>
                  <span>{formatSize(file.fileSize)}</span>
                  <span>{file.storedName}</span>
                </Space>
              }
            />
          </List.Item>
        )}
      />

      {/* Compliance Detail Modal */}
      <Modal
        title="PDF 合规检查结果"
        open={complianceModalOpen}
        onCancel={() => setComplianceModalOpen(false)}
        footer={null}
        width={600}
      >
        {selectedFile?.pdfAnalysis && (
          <div>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={
                selectedFile.pdfAnalysis.complianceStatus === 'PASS' ? 'success' :
                selectedFile.pdfAnalysis.complianceStatus === 'WARNING' ? 'warning' : 'error'
              }>
                {selectedFile.pdfAnalysis.complianceStatus === 'PASS' ? '合规' :
                 selectedFile.pdfAnalysis.complianceStatus === 'WARNING' ? '有警告' : '有错误'}
              </Tag>
              <Text type="secondary">
                PDF {selectedFile.pdfAnalysis.pdfVersion} | {selectedFile.pdfAnalysis.pageCount} 页
              </Text>
            </Space>

            {/* Errors */}
            {selectedFile.pdfAnalysis.complianceDetails?.errors?.length > 0 && (
              <>
                <Text strong style={{ color: '#ff4d4f', display: 'block', marginBottom: 8 }}>
                  错误 ({selectedFile.pdfAnalysis.complianceDetails.errors.length})
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={selectedFile.pdfAnalysis.complianceDetails.errors}
                  rowKey="ruleId"
                  columns={[
                    { title: '规则', dataIndex: 'ruleId', width: 60 },
                    { title: '描述', dataIndex: 'message' },
                    { title: '详情', dataIndex: 'detail', ellipsis: true },
                  ]}
                  style={{ marginBottom: 16 }}
                />
              </>
            )}

            {/* Warnings */}
            {selectedFile.pdfAnalysis.complianceDetails?.warnings?.length > 0 && (
              <>
                <Text strong style={{ color: '#faad14', display: 'block', marginBottom: 8 }}>
                  警告 ({selectedFile.pdfAnalysis.complianceDetails.warnings.length})
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={selectedFile.pdfAnalysis.complianceDetails.warnings}
                  rowKey="ruleId"
                  columns={[
                    { title: '规则', dataIndex: 'ruleId', width: 60 },
                    { title: '描述', dataIndex: 'message' },
                  ]}
                />
              </>
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
        width={700}
      >
        <Table
          size="small"
          loading={refLoading}
          dataSource={refFiles}
          rowKey="id"
          locale={{ emptyText: '无可引用的文件（需要前序序列且状态非草稿）' }}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: '序列',
              dataIndex: 'sequenceNumber',
              width: 70,
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: '章节',
              dataIndex: 'sectionNumber',
              width: 80,
            },
            {
              title: '文件名',
              dataIndex: 'originalName',
              ellipsis: true,
            },
            {
              title: '大小',
              dataIndex: 'fileSize',
              width: 80,
              render: (v: string) => formatSize(v),
            },
            {
              title: '操作',
              width: 80,
              render: (_: any, record: ReferenceableFile) => (
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleCreateRef(record.id)}
                >
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
