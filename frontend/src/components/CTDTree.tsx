import React, { useMemo, useState, useRef, useEffect } from 'react';
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
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
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
}

const statusDot: Record<string, { color: string; label: string }> = {
  EDITING: { color: '#1890ff', label: '编辑中' },
  COMPLETED: { color: '#52c41a', label: '已完成' },
};

const approvalIcon: Record<string, React.ReactNode> = {
  APPROVED: <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />,
  SUBMITTED: <ClockCircleFilled style={{ color: '#1890ff', fontSize: 12 }} />,
  REJECTED: <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 12 }} />,
};

export const CTDTree: React.FC<CTDTreeProps> = ({
  nodes,
  onNodeSelect,
  onAddExtension,
  onDeleteExtension: _onDeleteExtension,
  extensionOptions = [],
  isbiological = false,
  selectedNodeId,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(false);
  const [extensionModal, setExtensionModal] = useState<{
    visible: boolean;
    parentNodeId: string;
  }>({ visible: false, parentNodeId: '' });
  const [selectedExtType, setSelectedExtType] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(500);

  // Dynamic height
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        setTreeHeight(containerRef.current.clientHeight - 48);
      }
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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

      // Status dot + approval icon (only for leaves)
      const dot = node.isLeaf && statusDot[node.status];
      const appIcon = node.isLeaf && approvalIcon[node.approvalStatus];

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
          <span style={{ flexShrink: 0, color: '#8c8c8c', fontSize: 12, fontFamily: 'monospace' }}>
            {node.ctdSectionNumber}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.title}
          </span>
          {node.isRequired && node.status !== 'COMPLETED' && (
            <span style={{
              flexShrink: 0,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ff4d4f',
              display: 'inline-block',
            }} title="必填" />
          )}
          {dot && (
            <span style={{
              flexShrink: 0,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: dot.color,
              display: 'inline-block',
            }} title={dot.label} />
          )}
          {appIcon && <span style={{ flexShrink: 0, lineHeight: 1 }}>{appIcon}</span>}
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

  const handleRightClick = (info: { node: DataNode }) => {
    const nodeId = info.node.key as string;
    const seqNode = flatNodes.find((n) => n.id === nodeId);
    if (!seqNode) return;
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
    <div ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Input
        size="small"
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索章节编号或标题..."
        allowClear
        onChange={(e) => handleSearch(e.target.value)}
        style={{ marginBottom: 8, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Tree
          showIcon
          virtual
          height={Math.max(treeHeight, 200)}
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
          onRightClick={({ node }) => handleRightClick({ node })}
          defaultExpandedKeys={nodes.map((n) => n.id)}
        />
      </div>

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
