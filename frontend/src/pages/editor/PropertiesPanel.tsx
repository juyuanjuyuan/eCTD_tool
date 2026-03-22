import React, { useState, useEffect, useCallback } from 'react';
import {
  Tabs,
  Descriptions,
  Tag,
  Select,
  Input,
  Button,
  List,
  Space,
  message,
  Popconfirm,
  Typography,
  Divider,
  Modal,
  Badge,
} from 'antd';
import {
  HistoryOutlined,
  RollbackOutlined,
  CameraOutlined,
  PaperClipOutlined,
  AuditOutlined,
  CommentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UnlockOutlined,
  SendOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { ctdApi } from '../../services/ctd';
import { documentApi } from '../../services/document';
import { approvalApi } from '../../services/approval';
import { commentApi } from '../../services/comment';
import FilePanel from '../../components/FilePanel';
import type {
  SequenceNode,
  Document,
  DocumentVersion,
  ApprovalHistory,
  Comment,
} from '../../types';

const operationOptions = [
  { label: '新建 (new)', value: 'NEW' },
  { label: '替换 (replace)', value: 'REPLACE' },
  { label: '增补 (append)', value: 'APPEND' },
  { label: '删除 (delete)', value: 'DELETE' },
];

const langOptions = [
  { label: '中文 (zh)', value: 'zh' },
  { label: '英文 (en)', value: 'en' },
  { label: '未指定', value: '' },
];

const statusLabels: Record<string, { text: string; color: string }> = {
  EMPTY: { text: '未开始', color: 'default' },
  EDITING: { text: '编辑中', color: 'processing' },
  COMPLETED: { text: '已完成', color: 'success' },
};

// Sections that support backbone attributes
const SUBSTANCE_SECTIONS = new Set(['2.3.S', '3.2.S']);
const PRODUCT_SECTIONS = new Set(['2.3.P', '3.2.P']);
const INDICATION_SECTIONS = new Set(['2.7.3']);

interface PropertiesPanelProps {
  node: SequenceNode;
  sequenceId: string;
  sequenceNumber: string;
  document: Document | null;
  onNodeUpdated: () => void;
  onDocumentReloaded: (doc: Document) => void;
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  node,
  sequenceId,
  sequenceNumber,
  document: doc,
  onNodeUpdated,
  onDocumentReloaded,
}) => {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Approval state
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistory | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  // Comment state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);

  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';

  const isFirstSequence = sequenceNumber === '0000';
  const hasBackboneAttrs =
    SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) ||
    PRODUCT_SECTIONS.has(node.ctdSectionNumber) ||
    INDICATION_SECTIONS.has(node.ctdSectionNumber);

  // Load versions
  const loadVersions = useCallback(async () => {
    if (!node.id) return;
    setLoadingVersions(true);
    try {
      const data = await documentApi.getVersions(node.id);
      setVersions(data);
    } catch {
      // Ignore
    } finally {
      setLoadingVersions(false);
    }
  }, [node.id]);

  // Load approval history
  const loadApprovalHistory = useCallback(async () => {
    if (!node.id || !node.isLeaf) return;
    try {
      const data = await approvalApi.getHistory(node.id);
      setApprovalHistory(data);
    } catch {
      // Ignore
    }
  }, [node.id, node.isLeaf]);

  // Load comments
  const loadComments = useCallback(async () => {
    if (!node.id) return;
    setLoadingComments(true);
    try {
      const data = await commentApi.list(node.id);
      setComments(data);
    } catch {
      // Ignore
    } finally {
      setLoadingComments(false);
    }
  }, [node.id]);

  useEffect(() => {
    loadVersions();
    loadApprovalHistory();
    loadComments();
  }, [loadVersions, loadApprovalHistory, loadComments]);

  // Approval handlers
  const handleApprove = async () => {
    try {
      await approvalApi.approve(node.id);
      message.success('审批通过');
      onNodeUpdated();
      loadApprovalHistory();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      message.warning('请填写驳回理由');
      return;
    }
    try {
      await approvalApi.reject(node.id, rejectReason);
      message.success('已驳回');
      setRejectModalOpen(false);
      setRejectReason('');
      onNodeUpdated();
      loadApprovalHistory();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleUnlockApproval = async () => {
    try {
      await approvalApi.unlockApproval(node.id);
      message.success('已解锁，可重新编辑');
      onNodeUpdated();
      loadApprovalHistory();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Comment handlers
  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await commentApi.create(node.id, commentText, replyTo || undefined);
      setCommentText('');
      setReplyTo(null);
      loadComments();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await commentApi.delete(node.id, commentId);
      loadComments();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Update operation type
  const handleOperationChange = async (operation: string) => {
    try {
      await ctdApi.updateSequenceNode(sequenceId, node.id, { operation });
      message.success('操作类型已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Update node status
  const handleStatusChange = async (status: string) => {
    try {
      await ctdApi.updateSequenceNode(sequenceId, node.id, { status });
      message.success('状态已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Update backbone attributes
  const handleBackboneUpdate = async (field: string, value: string) => {
    try {
      await ctdApi.updateBackboneAttributes(sequenceId, node.id, { [field]: value });
      message.success('骨架属性已更新');
      onNodeUpdated();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Create version snapshot
  const handleCreateSnapshot = async () => {
    try {
      await documentApi.createSnapshot(node.id);
      message.success('版本快照已创建');
      loadVersions();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Restore version
  const handleRestore = async (version: number) => {
    try {
      const restored = await documentApi.restore(node.id, version);
      message.success(`已恢复到版本 ${version}`);
      onDocumentReloaded(restored);
      loadVersions();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <div style={{ padding: '0 12px' }}>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="CTD 编号">
              {node.ctdSectionNumber}
            </Descriptions.Item>
            <Descriptions.Item label="标题">
              {node.title}
            </Descriptions.Item>
            <Descriptions.Item label="所属模块">
              模块 {node.ctdSectionNumber.split('.')[0]}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusLabels[node.status]?.color}>
                {statusLabels[node.status]?.text}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {node.isLeaf && (
            <>
              <Divider style={{ margin: '12px 0' }} />

              {/* Status control */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  文档状态
                </Typography.Text>
                <Select
                  value={node.status}
                  options={[
                    { label: '未开始', value: 'EMPTY' },
                    { label: '编辑中', value: 'EDITING' },
                    { label: '已完成', value: 'COMPLETED' },
                  ]}
                  onChange={handleStatusChange}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>

              {/* Operation type */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  操作类型 (operation)
                </Typography.Text>
                {isFirstSequence ? (
                  <Tag color="blue">new (首次提交固定)</Tag>
                ) : (
                  <Select
                    value={node.operation || undefined}
                    options={operationOptions}
                    onChange={handleOperationChange}
                    style={{ width: '100%' }}
                    size="small"
                    placeholder="选择操作类型"
                  />
                )}
              </div>

              {/* Language attribute */}
              <div style={{ marginBottom: 12 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                  语言属性 (xml:lang)
                </Typography.Text>
                <Select
                  value={doc?.xmlLang || 'zh'}
                  options={langOptions}
                  style={{ width: '100%' }}
                  size="small"
                />
              </div>

              {/* Document stats */}
              {doc && (
                <Descriptions column={1} size="small" style={{ marginTop: 12 }}>
                  <Descriptions.Item label="字数">
                    {doc.wordCount}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本">
                    v{doc.version}
                  </Descriptions.Item>
                  {doc.updatedAt && (
                    <Descriptions.Item label="最后编辑">
                      {new Date(doc.updatedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              )}
            </>
          )}

          {/* Backbone attributes */}
          {hasBackboneAttrs && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Typography.Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                骨架属性
              </Typography.Text>

              {SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      活性成分 (substance) *
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.substance || ''}
                      onBlur={(e) => handleBackboneUpdate('substance', e.target.value)}
                      placeholder="必填"
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      生产商 (manufacturer) *
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.manufacturer || ''}
                      onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)}
                      placeholder="必填"
                    />
                  </div>
                </>
              )}

              {PRODUCT_SECTIONS.has(node.ctdSectionNumber) && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      产品名称 (product-name)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.productName || ''}
                      onBlur={(e) => handleBackboneUpdate('productName', e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      剂型 (dosageform)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.dosageForm || ''}
                      onBlur={(e) => handleBackboneUpdate('dosageForm', e.target.value)}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                      生产商 (manufacturer)
                    </Typography.Text>
                    <Input
                      size="small"
                      defaultValue={node.manufacturer || ''}
                      onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)}
                    />
                  </div>
                </>
              )}

              {INDICATION_SECTIONS.has(node.ctdSectionNumber) && (
                <div style={{ marginBottom: 8 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                    适应症 (indication) *
                  </Typography.Text>
                  <Input.TextArea
                    size="small"
                    rows={2}
                    defaultValue={node.indication || ''}
                    onBlur={(e) => handleBackboneUpdate('indication', e.target.value)}
                    placeholder="必填"
                  />
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      key: 'files',
      label: (
        <span>
          <PaperClipOutlined /> 文件
        </span>
      ),
      children: (
        <FilePanel nodeId={node.id} isLeaf={node.isLeaf} />
      ),
    },
    {
      key: 'versions',
      label: (
        <span>
          <HistoryOutlined /> 版本
          {versions.length > 0 && (
            <Tag style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>
              {versions.length}
            </Tag>
          )}
        </span>
      ),
      children: (
        <div style={{ padding: '0 12px' }}>
          <Button
            icon={<CameraOutlined />}
            size="small"
            onClick={handleCreateSnapshot}
            style={{ marginBottom: 12 }}
            block
            disabled={!doc?.id}
          >
            创建版本快照
          </Button>
          <List
            size="small"
            loading={loadingVersions}
            dataSource={versions}
            locale={{ emptyText: '暂无版本历史' }}
            renderItem={(ver) => (
              <List.Item
                actions={[
                  <Popconfirm
                    key="restore"
                    title={`确认恢复到版本 ${ver.version}？`}
                    description="当前内容会自动保存为新版本"
                    onConfirm={() => handleRestore(ver.version)}
                  >
                    <Button
                      type="link"
                      size="small"
                      icon={<RollbackOutlined />}
                    >
                      恢复
                    </Button>
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <span>v{ver.version}</span>
                      <Tag style={{ fontSize: 10 }}>{ver.wordCount} 字</Tag>
                    </Space>
                  }
                  description={new Date(ver.createdAt).toLocaleString('zh-CN')}
                />
              </List.Item>
            )}
          />
        </div>
      ),
    },
    // Approval tab
    ...(node.isLeaf
      ? [
          {
            key: 'approval',
            label: (
              <span>
                <AuditOutlined /> 审批
              </span>
            ),
            children: (
              <div style={{ padding: '0 12px' }}>
                {/* Current status */}
                <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
                  <Descriptions.Item label="审批状态">
                    <Tag
                      color={
                        node.approvalStatus === 'APPROVED'
                          ? 'green'
                          : node.approvalStatus === 'SUBMITTED'
                            ? 'blue'
                            : node.approvalStatus === 'REJECTED'
                              ? 'red'
                              : 'default'
                      }
                    >
                      {node.approvalStatus === 'APPROVED'
                        ? '已通过'
                        : node.approvalStatus === 'SUBMITTED'
                          ? '待审批'
                          : node.approvalStatus === 'REJECTED'
                            ? '已驳回'
                            : '草稿'}
                    </Tag>
                  </Descriptions.Item>
                  {approvalHistory?.submitterName && (
                    <Descriptions.Item label="提交人">
                      {approvalHistory.submitterName}
                    </Descriptions.Item>
                  )}
                  {approvalHistory?.submittedAt && (
                    <Descriptions.Item label="提交时间">
                      {new Date(approvalHistory.submittedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  )}
                  {approvalHistory?.approverName && (
                    <Descriptions.Item label="审批人">
                      {approvalHistory.approverName}
                    </Descriptions.Item>
                  )}
                  {approvalHistory?.approvedAt && (
                    <Descriptions.Item label="审批时间">
                      {new Date(approvalHistory.approvedAt).toLocaleString('zh-CN')}
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* Rejection reason */}
                {node.approvalStatus === 'REJECTED' && approvalHistory?.rejectionReason && (
                  <div style={{ marginBottom: 12, padding: 8, background: '#fff2f0', borderRadius: 4 }}>
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      驳回理由: {approvalHistory.rejectionReason}
                    </Typography.Text>
                  </div>
                )}

                {/* Manager actions */}
                {isManager && node.approvalStatus === 'SUBMITTED' && (
                  <Space style={{ marginBottom: 12 }}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={handleApprove}
                    >
                      通过
                    </Button>
                    <Button
                      danger
                      size="small"
                      icon={<CloseCircleOutlined />}
                      onClick={() => setRejectModalOpen(true)}
                    >
                      驳回
                    </Button>
                  </Space>
                )}

                {/* Unlock approved node */}
                {isManager && node.approvalStatus === 'APPROVED' && (
                  <Popconfirm
                    title="确认解锁？"
                    description="解锁后该节点可重新编辑"
                    onConfirm={handleUnlockApproval}
                  >
                    <Button
                      size="small"
                      icon={<UnlockOutlined />}
                      style={{ marginBottom: 12 }}
                      block
                    >
                      解锁审批（允许重新编辑）
                    </Button>
                  </Popconfirm>
                )}

                {/* Reject modal */}
                <Modal
                  title="驳回审批"
                  open={rejectModalOpen}
                  onOk={handleReject}
                  onCancel={() => {
                    setRejectModalOpen(false);
                    setRejectReason('');
                  }}
                  okText="确认驳回"
                  okButtonProps={{ danger: true }}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="请填写驳回理由"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                </Modal>
              </div>
            ),
          },
        ]
      : []),
    // Comments tab
    {
      key: 'comments',
      label: (
        <span>
          <CommentOutlined /> 评论
          {comments.length > 0 && (
            <Badge
              count={comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)}
              size="small"
              style={{ marginLeft: 4 }}
            />
          )}
        </span>
      ),
      children: (
        <div style={{ padding: '0 12px' }}>
          {/* Comment input */}
          <div style={{ marginBottom: 12 }}>
            {replyTo && (
              <div style={{ marginBottom: 4 }}>
                <Tag closable onClose={() => setReplyTo(null)} style={{ fontSize: 11 }}>
                  回复评论
                </Tag>
              </div>
            )}
            <Space.Compact style={{ width: '100%' }}>
              <Input.TextArea
                size="small"
                rows={2}
                placeholder="添加评论..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onPressEnter={(e) => {
                  if (e.ctrlKey) handleAddComment();
                }}
              />
            </Space.Compact>
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={handleAddComment}
              disabled={!commentText.trim()}
              style={{ marginTop: 4 }}
              block
            >
              发送
            </Button>
          </div>

          {/* Comments list */}
          <List
            size="small"
            loading={loadingComments}
            dataSource={comments}
            locale={{ emptyText: '暂无评论' }}
            renderItem={(comment) => (
              <div key={comment.id} style={{ marginBottom: 8 }}>
                <div style={{ background: '#fafafa', padding: 8, borderRadius: 4 }}>
                  <Space size={4} style={{ marginBottom: 4 }}>
                    <Typography.Text strong style={{ fontSize: 12 }}>
                      {comment.user.name}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      {new Date(comment.createdAt).toLocaleString('zh-CN')}
                    </Typography.Text>
                  </Space>
                  <div style={{ fontSize: 13 }}>{comment.content}</div>
                  <Space size={4} style={{ marginTop: 4 }}>
                    <Button
                      type="link"
                      size="small"
                      style={{ fontSize: 11, padding: 0 }}
                      onClick={() => setReplyTo(comment.id)}
                    >
                      回复
                    </Button>
                    {(comment.user.id === currentUser?.id || isManager) && (
                      <Popconfirm
                        title="确认删除？"
                        onConfirm={() => handleDeleteComment(comment.id)}
                      >
                        <Button
                          type="link"
                          size="small"
                          danger
                          style={{ fontSize: 11, padding: 0 }}
                          icon={<DeleteOutlined />}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
                {/* Replies */}
                {comment.replies?.map((reply) => (
                  <div
                    key={reply.id}
                    style={{
                      marginLeft: 16,
                      marginTop: 4,
                      background: '#f0f5ff',
                      padding: 8,
                      borderRadius: 4,
                    }}
                  >
                    <Space size={4} style={{ marginBottom: 4 }}>
                      <Typography.Text strong style={{ fontSize: 12 }}>
                        {reply.user.name}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {new Date(reply.createdAt).toLocaleString('zh-CN')}
                      </Typography.Text>
                    </Space>
                    <div style={{ fontSize: 13 }}>{reply.content}</div>
                    {(reply.user.id === currentUser?.id || isManager) && (
                      <Popconfirm
                        title="确认删除？"
                        onConfirm={() => handleDeleteComment(reply.id)}
                      >
                        <Button
                          type="link"
                          size="small"
                          danger
                          style={{ fontSize: 11, padding: 0 }}
                          icon={<DeleteOutlined />}
                        >
                          删除
                        </Button>
                      </Popconfirm>
                    )}
                  </div>
                ))}
              </div>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{
        padding: '12px',
        borderBottom: '1px solid #f0f0f0',
        fontWeight: 600,
        fontSize: 14,
      }}>
        属性面板
      </div>
      <Tabs
        items={tabItems}
        size="small"
        style={{ padding: '0 4px' }}
        tabBarStyle={{ margin: '0 8px' }}
      />
    </div>
  );
};

export default PropertiesPanel;
