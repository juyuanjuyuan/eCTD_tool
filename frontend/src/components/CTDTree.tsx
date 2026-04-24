import React, { useMemo, useState } from 'react';
import {
  Tree,
  Input,
  Modal,
  Select,
} from 'antd';
import {
  FolderOutlined,
  FileOutlined,
  AppstoreAddOutlined,
  SearchOutlined,
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
  selectedNodeId?: string;
  // Plan 13 (2026-04-23): 多实例节点支持
  onRequestAddInstance?: (node: SequenceNode) => void;
  onRequestRemoveInstance?: (node: SequenceNode) => void;
}

/**
 * Color legend for leaf node status:
 * - Red:   Required but empty (isRequired && status === EMPTY)
 * - Blue:  Editing in progress (status === EDITING)
 * - Green: Completed or approved (status === COMPLETED or approvalStatus === APPROVED)
 * - Gray:  Not required, empty (not required && status === EMPTY)
 */
const getNodeColor = (node: SequenceNode): { color: string; label: string } | null => {
  if (!node.isLeaf) return null;

  if (node.approvalStatus === 'APPROVED' || node.status === 'COMPLETED') {
    return { color: '#52c41a', label: '已完成' };
  }
  if (node.status === 'EDITING') {
    return { color: '#1890ff', label: '编辑中' };
  }
  if (node.isRequired && node.status === 'EMPTY') {
    return { color: '#ff4d4f', label: '必填未填' };
  }
  return null; // Non-required empty — no color dot
};

export const CTDTree: React.FC<CTDTreeProps> = ({
  nodes,
  onNodeSelect,
  onAddExtension,
  onDeleteExtension: _onDeleteExtension,
  extensionOptions = [],
  isbiological = false,
  selectedNodeId,
  onRequestAddInstance,
  onRequestRemoveInstance,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(false);
  const [extensionModal, setExtensionModal] = useState<{
    visible: boolean;
    parentNodeId: string;
  }>({ visible: false, parentNodeId: '' });
  const [selectedExtType, setSelectedExtType] = useState<string>('');

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
      let current = flatNodes.find((n) => n.id === m.parentId);
      while (current) {
        keys.add(current.id);
        current = flatNodes.find((n) => n.id === current!.parentId);
      }
    }
    setExpandedKeys(Array.from(keys));
    setAutoExpandParent(true);
  };

  const treeData = useMemo(() => {
    function buildNode(node: SequenceNode): DataNode {
      const isMatch = searchValue && (
        node.title.includes(searchValue) ||
        node.ctdSectionNumber.includes(searchValue)
      );
      const isSelected = node.id === selectedNodeId;

      // Icon
      let icon: React.ReactNode;
      if (node.isLeaf && node.elementName === 'node-extension') {
        icon = <AppstoreAddOutlined style={{ color: '#722ed1', fontSize: 14 }} />;
      } else if (node.isLeaf) {
        icon = <FileOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />;
      } else if (node.ctdSectionNumber.length === 1) {
        icon = <FolderOutlined style={{ color: '#faad14', fontSize: 14 }} />;
      } else {
        icon = <FolderOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />;
      }

      // Color indicator for leaf nodes
      const nodeColor = getNodeColor(node);

      const titleContent = (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: isMatch ? 600 : (node.ctdSectionNumber.length === 1 ? 500 : 400),
            color: isMatch ? '#1890ff' : (isSelected ? '#1890ff' : undefined),
            fontSize: 13,
            lineHeight: '22px',
          }}
        >
          {nodeColor && (
            <span
              style={{
                flexShrink: 0,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: nodeColor.color,
                display: 'inline-block',
                boxShadow: `0 0 0 1px ${nodeColor.color}33`,
              }}
              title={nodeColor.label}
            />
          )}
          <span style={{ flexShrink: 0, color: '#8c8c8c', fontSize: 12, fontFamily: 'monospace' }}>
            {node.ctdSectionNumber}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.title}
          </span>
          {/* Plan 13: 多实例节点显示 instanceLabel (如 "阿莫西林 - 石药") */}
          {node.instanceLabel && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                color: '#1890ff',
                background: '#e6f7ff',
                padding: '0 6px',
                borderRadius: 3,
                marginLeft: 4,
              }}
              title="实例标签"
            >
              {node.instanceLabel}
            </span>
          )}
        </span>
      );

      return {
        key: node.id,
        title: titleContent,
        icon,
        children: node.children?.map(buildNode) || [],
        isLeaf: node.isLeaf && !(node.children?.length),
      };
    }
    return nodes.map(buildNode);
  }, [nodes, searchValue, flatNodes, isbiological, selectedNodeId]);

  const handleRightClick = (info: { node: DataNode; event: { preventDefault?: () => void } }) => {
    const nodeId = info.node.key as string;
    const seqNode = flatNodes.find((n) => n.id === nodeId);
    if (!seqNode) return;
    if (seqNode.ctdSectionNumber === '3.2.R' && isbiological && onAddExtension) {
      setExtensionModal({ visible: true, parentNodeId: nodeId });
      return;
    }
    // Plan 13 (2026-04-23): 多实例节点右键
    // - 若 template.isRepeatable (容器如 3.2.S), 提供"添加实例"
    // - 若节点本身是某个 repeatable 模板的实例 (instanceLabel 非空), 提供"删除实例"
    if (seqNode.templateNode?.isRepeatable && onRequestAddInstance) {
      onRequestAddInstance(seqNode);
      return;
    }
    if (seqNode.instanceLabel && onRequestRemoveInstance) {
      onRequestRemoveInstance(seqNode);
      return;
    }
  };

  const handleAddExtension = () => {
    if (!selectedExtType || !extensionModal.parentNodeId) return;
    onAddExtension?.(extensionModal.parentNodeId, selectedExtType);
    setExtensionModal({ visible: false, parentNodeId: '' });
    setSelectedExtType('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Color legend */}
      <div style={{
        display: 'flex',
        gap: 12,
        padding: '6px 4px',
        marginBottom: 6,
        flexShrink: 0,
        flexWrap: 'wrap',
        borderBottom: '1px solid #f5f5f5',
      }}>
        {[
          { color: '#ff4d4f', label: '必填未填' },
          { color: '#1890ff', label: '编辑中' },
          { color: '#52c41a', label: '已完成' },
        ].map((item) => (
          <span
            key={item.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: '#8c8c8c',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: item.color,
                display: 'inline-block',
              }}
            />
            {item.label}
          </span>
        ))}
      </div>

      <Input
        size="small"
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索章节编号或标题..."
        allowClear
        onChange={(e) => handleSearch(e.target.value)}
        style={{ marginBottom: 8, flexShrink: 0 }}
      />
      <Tree
        showIcon
        treeData={treeData}
        expandedKeys={expandedKeys}
        selectedKeys={selectedNodeId ? [selectedNodeId] : []}
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
        onRightClick={({ node, event }) => handleRightClick({ node, event })}
        defaultExpandedKeys={nodes.map((n) => n.id)}
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
