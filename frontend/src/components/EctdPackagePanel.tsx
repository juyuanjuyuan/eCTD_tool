import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Button,
  Tree,
  Spin,
  message,
  Alert,
  Typography,
  Empty,
} from 'antd';
import {
  DownloadOutlined,
  FolderOutlined,
  FileOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { ectdApi } from '../services/ectd';
import type { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface Props {
  sequenceId: string;
  validationPassed: boolean;
}

/**
 * Build a tree structure from flat file paths for Ant Design Tree
 */
function buildTreeFromPaths(paths: string[]): DataNode[] {
  const root: Record<string, any> = {};

  for (const p of paths) {
    const parts = p.split('/');
    let current = root;
    for (const part of parts) {
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
  }

  function toTreeNodes(obj: Record<string, any>, prefix: string): DataNode[] {
    return Object.keys(obj)
      .sort()
      .map((key) => {
        const fullKey = prefix ? `${prefix}/${key}` : key;
        const children = toTreeNodes(obj[key], fullKey);
        const isLeaf = children.length === 0;
        return {
          key: fullKey,
          title: key,
          icon: isLeaf ? <FileOutlined /> : <FolderOutlined />,
          children: isLeaf ? undefined : children,
        };
      });
  }

  return toTreeNodes(root, '');
}

const EctdPackagePanel: React.FC<Props> = ({ sequenceId, validationPassed }) => {
  const [previewPaths, setPreviewPaths] = useState<string[]>([]);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewed, setPreviewed] = useState(false);

  const handlePreview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ectdApi.previewPackage(sequenceId);
      setPreviewPaths(data.paths || []);
      setTreeData(buildTreeFromPaths(data.paths || []));
      setPreviewed(true);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await ectdApi.exportPackage(sequenceId) as any;
      // Handle blob download
      const blob = new Blob([response], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ectd_package_${sequenceId.slice(0, 8)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('eCTD 提交包已下载');
    } catch (err: any) {
      // Try to parse error from blob
      let errorMsg = err.message;
      try {
        if (err.response?.data instanceof Blob) {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          errorMsg = parsed.message || errorMsg;
        }
      } catch {
        // Use original error
      }
      message.error(errorMsg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {!validationPassed && (
        <Alert
          type="warning"
          message="验证未通过"
          description="请先运行验证并修复所有错误，才能导出 eCTD 提交包"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title="eCTD 提交包"
        size="small"
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<EyeOutlined />} onClick={handlePreview} loading={loading}>
              预览结构
            </Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExport}
              loading={exporting}
              disabled={!validationPassed}
            >
              导出 eCTD 包
            </Button>
          </div>
        }
      >
        {!previewed ? (
          <Empty description="点击"预览结构"查看即将生成的文件夹结构" />
        ) : loading ? (
          <Spin />
        ) : (
          <>
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              共 {previewPaths.length} 个文件
            </Text>
            <Tree
              showIcon
              defaultExpandAll
              treeData={treeData}
              style={{ maxHeight: 500, overflow: 'auto' }}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default EctdPackagePanel;
