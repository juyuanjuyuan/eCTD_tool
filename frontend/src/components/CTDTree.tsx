import React, { useMemo, useState } from 'react';
import {
  Tree,
  Input,
  Tag,
  Modal,
  Select,
  Tooltip,
  Space,
} from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  AppstoreAddOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { SequenceNode, ExtensionOption } from '../types';
import type { DataNode } from 'antd/es/tree';

interface CTDTreeProps {
  nodes: SequenceNode[];
  onNodeSelect?: (node: SequenceNode) => void;
  onAddExtension?: (parentNodeId: string, extensionType: string) => void;
  onDeleteExtension?: (_nodeId: string) => void;
  extensionOptions?: ExtensionOption[];
  isbiological?: boolean;
}

const statusColorMap: Record<string, string> = {
  EMPTY: '#d9d9d9',
  EDITING: '#1890ff',
  COMPLETED: '#52c41a',
};

const statusLabelMap: Record<string, string> = {
  EMPTY: '未开始',
  EDITING: '编辑中',
  COMPLETED: '已完成',
};

const operationLabels: Record<string, string> = {
  NEW: '新建',
  REPLACE: '替换',
  APPEND: '增补',
  DELETE: '删除',
};

export const CTDTree: React.FC<CTDTreeProps> = ({
  nodes,
  onNodeSelect,
  onAddExtension,
  onDeleteExtension: _onDeleteExtension,
  extensionOptions = [],
  isbiological = false,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(false);
  const [extensionModal, setExtensionModal] = useState<{
    visible: boolean;
    parentNodeId: string;
  }>({ visible: false, parentNodeId: '' });
  const [selectedExtType, setSelectedExtType] = useState<string>('');

  // Build flat list for search
  const flatNodes = useMemo(() => {
    const result: SequenceNode[] = [];
    function flatten(items: SequenceNode[]) {
      for (const item of items) {
        result.push(item);
        if (item.children?.length) flatten(item.children);
      }
    }
    flatten(nodes);
    return result;
  }, [nodes]);

  // Search handling
  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (!value) {
      setAutoExpandParent(false);
      return;
    }
    const matched = flatNodes.filter(
      (n) =>
        n.title.includes(value) ||
        n.ctdSectionNumber.includes(value) ||
        n.elementName.includes(value),
    );
    const keys = new Set<React.Key>();
    for (const m of matched) {
      // Find all ancestor keys
      let current = flatNodes.find((n) => n.id === m.parentId);
      while (current) {
        keys.add(current.id);
        current = flatNodes.find((n) => n.id === current!.parentId);
      }
    }
    setExpandedKeys(Array.from(keys));
    setAutoExpandParent(true);
  };

  // Build tree data
  const treeData = useMemo(() => {
    function buildNode(node: SequenceNode): DataNode {
      const isSearch = searchValue && (
        node.title.includes(searchValue) ||
        node.ctdSectionNumber.includes(searchValue)
      );

      // Node icon
      let icon: React.ReactNode;
      if (node.isLeaf && node.elementName === 'node-extension') {
        icon = <AppstoreAddOutlined style={{ color: '#722ed1' }} />;
      } else if (node.isLeaf) {
        icon = <FileOutlined />;
      } else if (node.ctdSectionNumber.length === 1) {
        icon = <FolderOutlined style={{ color: '#faad14' }} />;
      } else {
        icon = <FolderOutlined />;
      }

      // Title with status indicators
      const titleContent = (
        <Space size={4} align="center">
          <span
            style={{
              fontWeight: isSearch ? 'bold' : 'normal',
              color: isSearch ? '#1890ff' : undefined,
            }}
          >
            {node.ctdSectionNumber} {node.title}
          </span>
          {node.isRequired && node.status !== 'COMPLETED' && (
            <Tag color="red" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              必填
            </Tag>
          )}
          {node.isLeaf && node.status !== 'EMPTY' && (
            <Tag
              color={statusColorMap[node.status]}
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}
            >
              {statusLabelMap[node.status]}
            </Tag>
          )}
          {node.isLeaf && node.operation && (
            <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              {operationLabels[node.operation]}
            </Tag>
          )}
          {node.isLeaf && node.approvalStatus === 'APPROVED' && (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
          )}
          {node.isLeaf && node.approvalStatus === 'SUBMITTED' && (
            <ClockCircleOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          )}
          {node.isLeaf && node.approvalStatus === 'REJECTED' && (
            <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />
          )}
          {flatNodes.find((n) => n.id === node.templateNodeId)?.ctdSectionNumber === '3.2.R' ||
            (node.ctdSectionNumber === '3.2.R' && isbiological && (
              <Tooltip title="可添加扩展节点">
                <AppstoreAddOutlined style={{ color: '#722ed1', fontSize: 12 }} />
              </Tooltip>
            ))}
        </Space>
      );

      const children = node.children?.map(buildNode) || [];

      return {
        key: node.id,
        title: titleContent,
        icon,
        children,
        isLeaf: node.isLeaf && !(node.children?.length),
      };
    }

    return nodes.map(buildNode);
  }, [nodes, searchValue, flatNodes, isbiological]);

  // Context menu for extension nodes
  const handleRightClick = (info: { node: DataNode }) => {
    const nodeId = info.node.key as string;
    const seqNode = flatNodes.find((n) => n.id === nodeId);
    if (!seqNode) return;

    // Allow adding extensions to 3.2.R node (if biological)
    if (seqNode.ctdSectionNumber === '3.2.R' && isbiological && onAddExtension) {
      setExtensionModal({ visible: true, parentNodeId: nodeId });
    }
  };

  const handleAddExtension = () => {
    if (!selectedExtType || !extensionModal.parentNodeId) return;
    onAddExtension?.(extensionModal.parentNodeId, selectedExtType);
    setExtensionModal({ visible: false, parentNodeId: '' });
    setSelectedExtType('');
  };

  return (
    <div>
      <Input
        prefix={<SearchOutlined />}
        placeholder="搜索章节..."
        allowClear
        onChange={(e) => handleSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Tree
        showIcon
        treeData={treeData}
        expandedKeys={expandedKeys}
        autoExpandParent={autoExpandParent}
        onExpand={(keys) => {
          setExpandedKeys(keys);
          setAutoExpandParent(false);
        }}
        onSelect={(keys) => {
          if (keys.length > 0) {
            const selected = flatNodes.find((n) => n.id === keys[0]);
            if (selected) onNodeSelect?.(selected);
          }
        }}
        onRightClick={({ node }) => handleRightClick({ node })}
        defaultExpandedKeys={nodes.map((n) => n.id)}
        style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}
      />

      <Modal
        title="添加扩展节点"
        open={extensionModal.visible}
        onOk={handleAddExtension}
        onCancel={() => {
          setExtensionModal({ visible: false, parentNodeId: '' });
          setSelectedExtType('');
        }}
      >
        <Select
          placeholder="选择扩展节点类型"
          style={{ width: '100%' }}
          value={selectedExtType || undefined}
          onChange={setSelectedExtType}
          options={extensionOptions.map((opt) => ({
            label: opt.titleZh,
            value: opt.type,
          }))}
        />
      </Modal>
    </div>
  );
};

export default CTDTree;
