import React, { useState } from 'react';
import {
  Modal,
  Radio,
  Button,
  Alert,
  Spin,
  Progress,
  List,
  Tag,
  Typography,
  Space,
  Descriptions,
  Collapse,
} from 'antd';
import {
  FileWordOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { exportApi, type ComplianceResult } from '../services/export';
import type { SequenceNode } from '../types';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  sequenceId: string;
  node: SequenceNode;
  batchNodeIds?: string[];
}

const ExportModal: React.FC<ExportModalProps> = ({
  open,
  onClose,
  sequenceId,
  node,
  batchNodeIds = [],
}) => {
  const [format, setFormat] = useState<'word' | 'pdf'>('pdf');
  const [exporting, setExporting] = useState(false);
  const [taskProgress, setTaskProgress] = useState(0);
  const [taskStatusText, setTaskStatusText] = useState('');
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [removedLinks, setRemovedLinks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isBatchMode = !node.isLeaf;
  const totalBatchNodes = batchNodeIds.length;

  const handleExport = async () => {
    setExporting(true);
    setTaskProgress(0);
    setTaskStatusText('');
    setError(null);
    setComplianceResult(null);
    setRemovedLinks([]);

    try {
      if (isBatchMode) {
        if (totalBatchNodes === 0) {
          throw new Error('当前节点下没有可导出的叶子章节');
        }

        const createTask =
          format === 'word'
            ? await exportApi.exportWordBatch(sequenceId, batchNodeIds)
            : await exportApi.exportPdfBatch(sequenceId, batchNodeIds);

        const taskId = createTask.taskId;
        const finalStatus = await pollTaskUntilDone(taskId, totalBatchNodes);

        if (finalStatus.status === 'failed') {
          throw new Error(finalStatus.error || '批量导出失败');
        }

        const download = await exportApi.getDownloadUrl(sequenceId, taskId);
        window.open(download.url, '_blank');
        onClose();
        return;
      }

      if (format === 'word') {
        const blob = await exportApi.exportWord(sequenceId, node.id);
        downloadBlob(blob, `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.docx`);
        onClose();
      } else {
        const result = await exportApi.exportPdf(sequenceId, node.id);
        if (result.complianceError) {
          setComplianceResult(result.complianceError.complianceResult);
          setRemovedLinks(result.complianceError.removedLinks || []);
        } else if (result.blob) {
          downloadBlob(result.blob, `${node.ctdSectionNumber.replace(/\./g, '-')}_${node.title}.pdf`);
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  const pollTaskUntilDone = async (
    taskId: string,
    total: number,
  ): Promise<{ status: string; progress: number; error?: string }> => {
    for (let i = 0; i < 600; i++) {
      const status = await exportApi.getTaskStatus(sequenceId, taskId);
      const progress = typeof status.progress === 'number' ? Math.max(0, Math.min(100, status.progress)) : 0;
      setTaskProgress(progress);

      const completed = Math.min(total, Math.floor((progress / 100) * total));
      setTaskStatusText(`正在生成第 ${Math.max(1, completed)} / ${total} 个文件...`);

      if (status.status === 'completed' || status.status === 'failed') {
        setTaskProgress(status.status === 'completed' ? 100 : progress);
        setTaskStatusText(
          status.status === 'completed'
            ? `已完成 ${total} / ${total} 个文件`
            : `任务失败（已处理 ${completed} / ${total}）`,
        );
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { status: 'failed', progress: taskProgress, error: '导出任务超时，请稍后重试' };
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setComplianceResult(null);
    setRemovedLinks([]);
    setTaskProgress(0);
    setTaskStatusText('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      title="导出文档"
      open={open}
      onCancel={handleClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={handleClose}>
          取消
        </Button>,
        <Button
          key="export"
          type="primary"
          icon={format === 'word' ? <FileWordOutlined /> : <FilePdfOutlined />}
          loading={exporting}
          onClick={handleExport}
        >
          导出 {format === 'word' ? 'Word' : 'PDF'}
        </Button>,
      ]}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {/* Chapter info */}
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="章节">
            {node.ctdSectionNumber} {node.title}
          </Descriptions.Item>
          {!node.isLeaf && (
            <Descriptions.Item label="导出范围">
              当前节点下叶子章节：{totalBatchNodes} 个（批量压缩包）
            </Descriptions.Item>
          )}
          <Descriptions.Item label="状态">
            <Tag>{node.status}</Tag>
          </Descriptions.Item>
        </Descriptions>

        {/* Format selection */}
        <div>
          <Typography.Text strong>导出格式</Typography.Text>
          <Radio.Group
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setComplianceResult(null);
            }}
            style={{ display: 'flex', marginTop: 8 }}
          >
            <Radio.Button value="word" style={{ flex: 1, textAlign: 'center' }}>
              <FileWordOutlined /> Word (.docx)
            </Radio.Button>
            <Radio.Button value="pdf" style={{ flex: 1, textAlign: 'center' }}>
              <FilePdfOutlined /> PDF (eCTD 合规)
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* PDF compliance info */}
        {format === 'pdf' && (
          <Alert
            type="info"
            showIcon
            message="eCTD PDF 合规导出"
            description="导出的 PDF 将自动: 使用宋体/黑体字体、添加书签、设置 Inherit Zoom、移除外部链接、运行合规检查。"
          />
        )}

        {/* Export in progress */}
        {exporting && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#8c8c8c' }}>
              {isBatchMode
                ? `正在生成${format === 'word' ? 'Word' : 'PDF'}批量导出包...`
                : `正在生成${format === 'word' ? 'Word' : 'PDF'}文档...`}
            </div>
            {isBatchMode && (
              <div style={{ marginTop: 12 }}>
                <Progress percent={taskProgress} size="small" status="active" />
                <Typography.Text type="secondary">{taskStatusText}</Typography.Text>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && <Alert type="error" message="导出失败" description={error} showIcon />}

        {/* Compliance results */}
        {complianceResult && (
          <div>
            <Alert
              type={complianceResult.isCompliant ? 'success' : 'error'}
              showIcon
              icon={complianceResult.isCompliant ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              message={
                complianceResult.isCompliant
                  ? 'PDF 通过 eCTD 合规检查'
                  : `PDF 未通过 eCTD 合规检查（${complianceResult.errors.length} 个错误）`
              }
              style={{ marginBottom: 12 }}
            />

            {/* Summary */}
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
              <Descriptions.Item label="PDF 版本">
                {complianceResult.summary.pdfVersion}
              </Descriptions.Item>
              <Descriptions.Item label="页数">
                {complianceResult.summary.pageCount}
              </Descriptions.Item>
              <Descriptions.Item label="书签">
                {complianceResult.summary.hasBookmarks ? (
                  <Tag color="green">有</Tag>
                ) : (
                  <Tag color="red">无</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="文件大小">
                {complianceResult.summary.fileSizeMB} MB
              </Descriptions.Item>
            </Descriptions>

            {/* Errors */}
            {complianceResult.errors.length > 0 && (
              <Collapse
                items={[
                  {
                    key: 'errors',
                    label: (
                      <span>
                        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />{' '}
                        错误 ({complianceResult.errors.length})
                      </span>
                    ),
                    children: (
                      <List
                        size="small"
                        dataSource={complianceResult.errors}
                        renderItem={(item) => (
                          <List.Item>
                            <List.Item.Meta
                              title={
                                <Space>
                                  <Tag color="red">{item.ruleId}</Tag>
                                  {item.message}
                                </Space>
                              }
                              description={item.detail}
                            />
                          </List.Item>
                        )}
                      />
                    ),
                  },
                ]}
                defaultActiveKey={['errors']}
              />
            )}

            {/* Warnings */}
            {complianceResult.warnings.length > 0 && (
              <Collapse
                style={{ marginTop: 8 }}
                items={[
                  {
                    key: 'warnings',
                    label: (
                      <span>
                        <WarningOutlined style={{ color: '#faad14' }} />{' '}
                        警告 ({complianceResult.warnings.length})
                      </span>
                    ),
                    children: (
                      <List
                        size="small"
                        dataSource={complianceResult.warnings}
                        renderItem={(item) => (
                          <List.Item>
                            <List.Item.Meta
                              title={
                                <Space>
                                  <Tag color="orange">{item.ruleId}</Tag>
                                  {item.message}
                                </Space>
                              }
                              description={item.detail}
                            />
                          </List.Item>
                        )}
                      />
                    ),
                  },
                ]}
              />
            )}

            {/* Removed links */}
            {removedLinks.length > 0 && (
              <Alert
                type="warning"
                showIcon
                icon={<WarningOutlined />}
                message={`已移除 ${removedLinks.length} 个外部链接`}
                description={removedLinks.slice(0, 5).join('\n')}
                style={{ marginTop: 8 }}
              />
            )}
          </div>
        )}
      </Space>
    </Modal>
  );
};

export default ExportModal;
