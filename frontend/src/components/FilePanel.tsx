import React, { useState, useEffect, useCallback } from 'react';
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

  const beforeUpload = (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      message.error(`不支持的文件类型 ${ext}。仅允许: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return Upload.LIST_IGNORE;
    }
    const maxSize = ext === '.xpt' ? 4 * 1024 * 1024 * 1024 : 200 * 1024 * 1024;
    if (file.size > maxSize) {
      message.error(`文件大小超过限制 (${ext === '.xpt' ? '4GB' : '200MB'})`);
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
      {/* Upload area */}
      <Upload.Dragger
        customRequest={handleUpload}
        beforeUpload={beforeUpload}
        showUploadList={false}
        multiple={false}
        disabled={uploading}
        style={{
          marginBottom: 16,
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
            支持格式: {ALLOWED_EXTENSIONS.join('  ')}，单文件最大 200MB（XPT 4GB）
          </p>
        </div>
      </Upload.Dragger>

      {/* Upload progress */}
      {uploading && (
        <Progress
          percent={uploadProgress}
          strokeColor="#1890ff"
          style={{ marginBottom: 16 }}
        />
      )}

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
