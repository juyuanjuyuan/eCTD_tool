import React, { useState } from 'react';
import {
  Modal,
  Tabs,
  Input,
  Upload,
  Select,
  Button,
  Space,
  message,
  Alert,
  Typography,
  List,
  Tag,
} from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { studyApi, type ImportConflictMode } from '../services/study';

const { TextArea } = Input;
const { Text } = Typography;
const { Dragger } = Upload;

interface StudyImportModalProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  onImported: () => void;
}

/**
 * Plan 12 §4.3 — modal for importing STF XML files. Two modes:
 *  1. Paste XML — text-area, calls importStfXml
 *  2. Upload bundle — STF XML file + referenced PDFs, calls importStfBundle
 */
const StudyImportModal: React.FC<StudyImportModalProps> = ({
  open,
  onClose,
  nodeId,
  onImported,
}) => {
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [xml, setXml] = useState('');
  const [conflict, setConflict] = useState<ImportConflictMode>('reject');
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Bundle mode state
  const [xmlFile, setXmlFile] = useState<UploadFile | null>(null);
  const [pdfFiles, setPdfFiles] = useState<UploadFile[]>([]);

  const reset = () => {
    setXml('');
    setXmlFile(null);
    setPdfFiles([]);
    setWarnings([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        // strip data URL prefix
        const idx = result.indexOf('base64,');
        resolve(idx >= 0 ? result.slice(idx + 7) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleImportPaste = async () => {
    if (!xml.trim()) {
      message.error('请粘贴 STF XML 内容');
      return;
    }
    setImporting(true);
    setWarnings([]);
    try {
      const result = await studyApi.importStfXml(nodeId, { xml, onConflict: conflict });
      message.success(`已导入研究 ${result.studyId}`);
      setWarnings(result.warnings || []);
      if (!result.warnings?.length) {
        onImported();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      message.error(`导入失败: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const handleImportBundle = async () => {
    if (!xmlFile || !xmlFile.originFileObj) {
      message.error('请上传 STF XML 文件');
      return;
    }
    setImporting(true);
    setWarnings([]);
    try {
      const xmlText = await readFileAsText(xmlFile.originFileObj as File);
      const filesPayload = await Promise.all(
        pdfFiles
          .filter((f) => !!f.originFileObj)
          .map(async (f) => ({
            originalName: f.name,
            base64: await readFileAsBase64(f.originFileObj as File),
          })),
      );
      const result = await studyApi.importStfBundle(nodeId, {
        xml: xmlText,
        files: filesPayload,
        onConflict: conflict,
      });
      message.success(`已导入研究 ${result.studyId}`);
      setWarnings(result.warnings || []);
      if (!result.warnings?.length) {
        onImported();
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      message.error(`导入失败: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title="从 STF XML 导入研究"
      width={680}
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            loading={importing}
            onClick={tab === 'paste' ? handleImportPaste : handleImportBundle}
          >
            导入
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Space>
          <Text>冲突处理：</Text>
          <Select
            value={conflict}
            onChange={setConflict}
            style={{ width: 220 }}
            options={[
              { label: '拒绝 (reject) — 已存在则失败', value: 'reject' },
              { label: '覆盖 (overwrite) — 删除旧研究', value: 'overwrite' },
              { label: '合并 (merge) — 保留 ID 更新数据', value: 'merge' },
            ]}
          />
        </Space>

        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as 'paste' | 'upload')}
          items={[
            {
              key: 'paste',
              label: (
                <span>
                  <FileTextOutlined /> 粘贴 XML
                </span>
              ),
              children: (
                <TextArea
                  value={xml}
                  onChange={(e) => setXml(e.target.value)}
                  rows={14}
                  placeholder="将 STF XML 文件内容粘贴到此处..."
                  spellCheck={false}
                />
              ),
            },
            {
              key: 'upload',
              label: (
                <span>
                  <InboxOutlined /> 上传文件
                </span>
              ),
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Dragger
                    accept=".xml"
                    multiple={false}
                    maxCount={1}
                    fileList={xmlFile ? [xmlFile] : []}
                    beforeUpload={() => false}
                    onChange={(info) => {
                      const file = info.fileList[0];
                      setXmlFile(file ?? null);
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">
                      拖拽或点击上传 STF XML 文件 (.xml)
                    </p>
                  </Dragger>
                  <Dragger
                    accept=".pdf"
                    multiple
                    fileList={pdfFiles}
                    beforeUpload={() => false}
                    onChange={(info) => setPdfFiles(info.fileList)}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">
                      拖拽或点击上传 STF 引用的 PDF 文件 (可多选)
                    </p>
                    <p className="ant-upload-hint">
                      文件名需与 STF XML 中的 xlink:href 保持一致
                    </p>
                  </Dragger>
                </Space>
              ),
            },
          ]}
        />

        {warnings.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message={`导入完成，但有 ${warnings.length} 条警告`}
            description={
              <List
                size="small"
                dataSource={warnings}
                renderItem={(w) => (
                  <List.Item>
                    <Tag color="orange">!</Tag> {w}
                  </List.Item>
                )}
              />
            }
            action={
              <Button size="small" type="link" onClick={onImported}>
                忽略并刷新
              </Button>
            }
          />
        )}
      </Space>
    </Modal>
  );
};

export default StudyImportModal;
