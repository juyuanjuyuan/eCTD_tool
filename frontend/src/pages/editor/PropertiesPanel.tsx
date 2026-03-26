import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Tabs,
  Tag,
  Select,
  Input,
  Button,
  List,
  Space,
  message,
  Popconfirm,
  Typography,
  Modal,
  Badge,
  Avatar,
} from 'antd';
import {
  HistoryOutlined,
  RollbackOutlined,
  CameraOutlined,
  AuditOutlined,
  CommentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UnlockOutlined,
  SendOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  CheckCircleFilled,
  ClockCircleFilled,
  CloseCircleFilled,
  UserOutlined,
} from '@ant-design/icons';
import { ctdApi } from '../../services/ctd';
import { documentApi } from '../../services/document';
import { approvalApi } from '../../services/approval';
import { commentApi } from '../../services/comment';
import { userApi, type UserSearchResult } from '../../services/user';
import type {
  SequenceNode,
  Document,
  DocumentVersion,
  ApprovalHistory,
  Comment,
} from '../../types';

const { Text } = Typography;

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

const statusOptions = [
  { label: '未开始', value: 'EMPTY' },
  { label: '编辑中', value: 'EDITING' },
  { label: '已完成', value: 'COMPLETED' },
];

const statusLabels: Record<string, { text: string; color: string }> = {
  EMPTY: { text: '未开始', color: 'default' },
  EDITING: { text: '编辑中', color: 'processing' },
  COMPLETED: { text: '已完成', color: 'success' },
};

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

/* Reusable form field wrapper */
const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <div style={{ marginBottom: 14 }}>
    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 5 }}>
      {label}{required && <span style={{ color: '#ff4d4f' }}> *</span>}
    </Text>
    {children}
  </div>
);

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
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistory | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<UserSearchResult[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const commentInputRef = useRef<any>(null);

  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;
  const isManager = currentUser?.role === 'ADMIN' || currentUser?.role === 'MANAGER';
  const isFirstSequence = sequenceNumber === '0000';
  const hasBackboneAttrs =
    SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) ||
    PRODUCT_SECTIONS.has(node.ctdSectionNumber) ||
    INDICATION_SECTIONS.has(node.ctdSectionNumber);

  const loadVersions = useCallback(async () => {
    if (!node.id) return;
    setLoadingVersions(true);
    try { setVersions(await documentApi.getVersions(node.id)); } catch { /* */ }
    finally { setLoadingVersions(false); }
  }, [node.id]);

  const loadApprovalHistory = useCallback(async () => {
    if (!node.id || !node.isLeaf) return;
    try { setApprovalHistory(await approvalApi.getHistory(node.id)); } catch { /* */ }
  }, [node.id, node.isLeaf]);

  const loadComments = useCallback(async () => {
    if (!node.id) return;
    setLoadingComments(true);
    try { setComments(await commentApi.list(node.id)); } catch { /* */ }
    finally { setLoadingComments(false); }
  }, [node.id]);

  useEffect(() => {
    loadVersions();
    loadApprovalHistory();
    loadComments();
  }, [loadVersions, loadApprovalHistory, loadComments]);

  // Approval handlers
  const handleApprove = async () => {
    try { await approvalApi.approve(node.id); message.success('审批通过'); onNodeUpdated(); loadApprovalHistory(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleReject = async () => {
    if (!rejectReason.trim()) { message.warning('请填写驳回理由'); return; }
    try { await approvalApi.reject(node.id, rejectReason); message.success('已驳回'); setRejectModalOpen(false); setRejectReason(''); onNodeUpdated(); loadApprovalHistory(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleUnlockApproval = async () => {
    try { await approvalApi.unlockApproval(node.id); message.success('已解锁，可重新编辑'); onNodeUpdated(); loadApprovalHistory(); }
    catch (err: any) { message.error(err.message); }
  };

  // @mention
  useEffect(() => {
    if (mentionQuery === null) { setMentionUsers([]); return; }
    const timer = setTimeout(async () => {
      try { setMentionUsers(await userApi.search(mentionQuery)); setMentionIndex(0); }
      catch { setMentionUsers([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [mentionQuery]);

  const handleCommentChange = (value: string) => {
    setCommentText(value);
    const cursorPos = commentInputRef.current?.resizableTextArea?.textArea?.selectionStart || value.length;
    const textBefore = value.slice(0, cursorPos);
    const atMatch = textBefore.match(/@(\S*)$/);
    setMentionQuery(atMatch ? atMatch[1] : null);
  };

  const insertMention = (user: UserSearchResult) => {
    const cursorPos = commentInputRef.current?.resizableTextArea?.textArea?.selectionStart || commentText.length;
    const textBefore = commentText.slice(0, cursorPos);
    const textAfter = commentText.slice(cursorPos);
    const atIndex = textBefore.lastIndexOf('@');
    setCommentText(textBefore.slice(0, atIndex) + `@${user.name} ` + textAfter);
    setMentionQuery(null);
    setMentionUsers([]);
    if (!mentionedIds.includes(user.id)) setMentionedIds((prev) => [...prev, user.id]);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await commentApi.create(node.id, commentText, replyTo || undefined, mentionedIds.length > 0 ? mentionedIds : undefined);
      setCommentText(''); setReplyTo(null); setMentionedIds([]); loadComments();
    } catch (err: any) { message.error(err.message); }
  };

  const handleDeleteComment = async (commentId: string) => {
    try { await commentApi.delete(node.id, commentId); loadComments(); }
    catch (err: any) { message.error(err.message); }
  };

  const handleOperationChange = async (operation: string) => {
    try { await ctdApi.updateSequenceNode(sequenceId, node.id, { operation }); message.success('操作类型已更新'); onNodeUpdated(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleStatusChange = async (status: string) => {
    try { await ctdApi.updateSequenceNode(sequenceId, node.id, { status }); message.success('状态已更新'); onNodeUpdated(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleBackboneUpdate = async (field: string, value: string) => {
    try { await ctdApi.updateBackboneAttributes(sequenceId, node.id, { [field]: value }); message.success('骨架属性已更新'); onNodeUpdated(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleCreateSnapshot = async () => {
    try { await documentApi.createSnapshot(node.id); message.success('版本快照已创建'); loadVersions(); }
    catch (err: any) { message.error(err.message); }
  };
  const handleRestore = async (version: number) => {
    try { const restored = await documentApi.restore(node.id, version); message.success(`已恢复到版本 ${version}`); onDocumentReloaded(restored); loadVersions(); }
    catch (err: any) { message.error(err.message); }
  };

  const totalComments = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);

  /* ─────── Info Tab ─────── */
  const infoTab = (
    <div style={{ padding: '4px 16px 16px' }}>
      {/* Status summary */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        padding: '10px 12px',
        background: '#fafafa',
        borderRadius: 6,
      }}>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>模块</Text>
          <div style={{ fontSize: 13, fontWeight: 500 }}>模块 {node.ctdSectionNumber.split('.')[0]}</div>
        </div>
        <div style={{ flex: 1 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>状态</Text>
          <div><Tag color={statusLabels[node.status]?.color} style={{ margin: 0 }}>{statusLabels[node.status]?.text}</Tag></div>
        </div>
        {node.isLeaf && node.operation && (
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>操作</Text>
            <div><Tag style={{ margin: 0 }}>{node.operation}</Tag></div>
          </div>
        )}
      </div>

      {node.isLeaf && (
        <>
          <Field label="文档状态">
            <Select value={node.status} options={statusOptions} onChange={handleStatusChange} style={{ width: '100%' }} />
          </Field>

          <Field label="操作类型 (operation)">
            {isFirstSequence ? (
              <Tag color="blue">new (首次提交固定)</Tag>
            ) : (
              <Select value={node.operation || undefined} options={operationOptions} onChange={handleOperationChange} style={{ width: '100%' }} placeholder="选择操作类型" />
            )}
          </Field>

          <Field label="语言属性 (xml:lang)">
            <Select value={doc?.xmlLang || 'zh'} options={langOptions} style={{ width: '100%' }} />
          </Field>

          {doc && (
            <div style={{
              display: 'flex',
              gap: 16,
              padding: '10px 12px',
              background: '#fafafa',
              borderRadius: 6,
              marginTop: 4,
            }}>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>版本</Text>
                <div style={{ fontSize: 13 }}>v{doc.version}</div>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>字数</Text>
                <div style={{ fontSize: 13 }}>{doc.wordCount}</div>
              </div>
              {doc.updatedAt && (
                <div style={{ flex: 1 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>最后编辑</Text>
                  <div style={{ fontSize: 13 }}>{new Date(doc.updatedAt).toLocaleString('zh-CN')}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Backbone attributes */}
      {hasBackboneAttrs && (
        <div style={{ marginTop: 16, padding: '12px', background: '#f6f8fa', borderRadius: 6 }}>
          <Space size={6} style={{ marginBottom: 10 }}>
            <InfoCircleOutlined style={{ color: '#1890ff' }} />
            <Text strong style={{ fontSize: 13 }}>骨架属性</Text>
          </Space>

          {SUBSTANCE_SECTIONS.has(node.ctdSectionNumber) && (
            <>
              <Field label="活性成分 (substance)" required>
                <Input defaultValue={node.substance || ''} onBlur={(e) => handleBackboneUpdate('substance', e.target.value)} placeholder="必填" />
              </Field>
              <Field label="生产商 (manufacturer)" required>
                <Input defaultValue={node.manufacturer || ''} onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)} placeholder="必填" />
              </Field>
            </>
          )}

          {PRODUCT_SECTIONS.has(node.ctdSectionNumber) && (
            <>
              <Field label="产品名称 (product-name)">
                <Input defaultValue={node.productName || ''} onBlur={(e) => handleBackboneUpdate('productName', e.target.value)} />
              </Field>
              <Field label="剂型 (dosageform)">
                <Input defaultValue={node.dosageForm || ''} onBlur={(e) => handleBackboneUpdate('dosageForm', e.target.value)} />
              </Field>
              <Field label="生产商 (manufacturer)">
                <Input defaultValue={node.manufacturer || ''} onBlur={(e) => handleBackboneUpdate('manufacturer', e.target.value)} />
              </Field>
            </>
          )}

          {INDICATION_SECTIONS.has(node.ctdSectionNumber) && (
            <Field label="适应症 (indication)" required>
              <Input.TextArea rows={2} defaultValue={node.indication || ''} onBlur={(e) => handleBackboneUpdate('indication', e.target.value)} placeholder="必填" />
            </Field>
          )}
        </div>
      )}
    </div>
  );

  /* ─────── Versions Tab ─────── */
  const versionsTab = (
    <div style={{ padding: '4px 16px 16px' }}>
      <Button icon={<CameraOutlined />} onClick={handleCreateSnapshot} style={{ marginBottom: 14 }} block disabled={!doc?.id}>
        创建版本快照
      </Button>
      <List
        loading={loadingVersions}
        dataSource={versions}
        locale={{ emptyText: '暂无版本历史' }}
        renderItem={(ver) => (
          <List.Item
            style={{ padding: '10px 0' }}
            actions={[
              <Popconfirm key="restore" title={`确认恢复到版本 ${ver.version}？`} description="当前内容会自动保存为新版本" onConfirm={() => handleRestore(ver.version)}>
                <Button type="link" size="small" icon={<RollbackOutlined />}>恢复</Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={<Space><Text strong>v{ver.version}</Text><Text type="secondary" style={{ fontSize: 12 }}>{ver.wordCount} 字</Text></Space>}
              description={<Text type="secondary" style={{ fontSize: 12 }}>{new Date(ver.createdAt).toLocaleString('zh-CN')}</Text>}
            />
          </List.Item>
        )}
      />
    </div>
  );

  /* ─────── Approval Tab ─────── */
  const approvalTab = (
    <div style={{ padding: '4px 16px 16px' }}>
      {/* Current status card */}
      <div style={{
        padding: '14px',
        background: node.approvalStatus === 'APPROVED' ? '#f6ffed'
          : node.approvalStatus === 'SUBMITTED' ? '#e6f7ff'
          : node.approvalStatus === 'REJECTED' ? '#fff2f0'
          : '#fafafa',
        borderRadius: 8,
        marginBottom: 16,
        border: `1px solid ${
          node.approvalStatus === 'APPROVED' ? '#b7eb8f'
          : node.approvalStatus === 'SUBMITTED' ? '#91d5ff'
          : node.approvalStatus === 'REJECTED' ? '#ffccc7'
          : '#f0f0f0'
        }`,
      }}>
        <Space size={8} style={{ marginBottom: 8 }}>
          {node.approvalStatus === 'APPROVED' && <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />}
          {node.approvalStatus === 'SUBMITTED' && <ClockCircleFilled style={{ color: '#1890ff', fontSize: 18 }} />}
          {node.approvalStatus === 'REJECTED' && <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />}
          <Text strong style={{ fontSize: 14 }}>
            {node.approvalStatus === 'APPROVED' ? '已通过'
              : node.approvalStatus === 'SUBMITTED' ? '待审批'
              : node.approvalStatus === 'REJECTED' ? '已驳回'
              : '草稿'}
          </Text>
        </Space>

        {approvalHistory?.submitterName && (
          <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>
            提交人: {approvalHistory.submitterName}
            {approvalHistory.submittedAt && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {new Date(approvalHistory.submittedAt).toLocaleString('zh-CN')}
              </Text>
            )}
          </div>
        )}
        {approvalHistory?.approverName && (
          <div style={{ fontSize: 13, color: '#595959', marginTop: 4 }}>
            审批人: {approvalHistory.approverName}
            {approvalHistory.approvedAt && (
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                {new Date(approvalHistory.approvedAt).toLocaleString('zh-CN')}
              </Text>
            )}
          </div>
        )}
      </div>

      {/* Rejection reason */}
      {node.approvalStatus === 'REJECTED' && approvalHistory?.rejectionReason && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fff2f0', borderRadius: 6, border: '1px solid #ffccc7' }}>
          <Text type="danger" style={{ fontSize: 13 }}>
            驳回理由: {approvalHistory.rejectionReason}
          </Text>
        </div>
      )}

      {/* Manager actions */}
      {isManager && node.approvalStatus === 'SUBMITTED' && (
        <Space style={{ marginBottom: 16, width: '100%' }} size={8}>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleApprove} style={{ flex: 1 }}>
            通过
          </Button>
          <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejectModalOpen(true)} style={{ flex: 1 }}>
            驳回
          </Button>
        </Space>
      )}

      {isManager && node.approvalStatus === 'APPROVED' && (
        <Popconfirm title="确认解锁？" description="解锁后该节点可重新编辑" onConfirm={handleUnlockApproval}>
          <Button icon={<UnlockOutlined />} style={{ marginBottom: 16 }} block>
            解锁审批（允许重新编辑）
          </Button>
        </Popconfirm>
      )}

      <Modal
        title="驳回审批"
        open={rejectModalOpen}
        onOk={handleReject}
        onCancel={() => { setRejectModalOpen(false); setRejectReason(''); }}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <Input.TextArea rows={3} placeholder="请填写驳回理由..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
      </Modal>
    </div>
  );

  /* ─────── Comments Tab ─────── */
  const commentsTab = (
    <div style={{ padding: '4px 16px 16px' }}>
      {/* Comment input */}
      <div style={{ marginBottom: 16 }}>
        {replyTo && (
          <div style={{ marginBottom: 6 }}>
            <Tag closable onClose={() => setReplyTo(null)} style={{ fontSize: 12 }}>
              回复评论
            </Tag>
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <Input.TextArea
            ref={commentInputRef}
            rows={3}
            placeholder="添加评论... (输入 @ 提及用户，Ctrl+Enter 发送)"
            value={commentText}
            onChange={(e) => handleCommentChange(e.target.value)}
            onPressEnter={(e) => { if (e.ctrlKey) handleAddComment(); }}
            onKeyDown={(e) => {
              if (mentionUsers.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionUsers.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); insertMention(mentionUsers[mentionIndex]); }
                else if (e.key === 'Escape') { setMentionQuery(null); setMentionUsers([]); }
              }
            }}
            style={{ borderRadius: 6 }}
          />
          {mentionUsers.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              boxShadow: '0 3px 12px rgba(0,0,0,0.12)',
              maxHeight: 180,
              overflowY: 'auto',
              zIndex: 10,
            }}>
              {mentionUsers.map((u, i) => (
                <div
                  key={u.id}
                  style={{
                    padding: '8px 14px',
                    cursor: 'pointer',
                    background: i === mentionIndex ? '#e6f7ff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={() => setMentionIndex(i)}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
                >
                  <Avatar size={24} icon={<UserOutlined />} style={{ flexShrink: 0 }} />
                  <div>
                    <Text strong style={{ fontSize: 13 }}>{u.name}</Text>
                    <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>{u.email}</Text>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleAddComment}
          disabled={!commentText.trim()}
          style={{ marginTop: 8 }}
          block
        >
          发送
        </Button>
      </div>

      {/* Comments list */}
      <List
        loading={loadingComments}
        dataSource={comments}
        locale={{ emptyText: '暂无评论' }}
        split={false}
        renderItem={(comment) => (
          <div key={comment.id} style={{ marginBottom: 12 }}>
            <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Avatar size={22} icon={<UserOutlined />} style={{ background: '#1890ff', flexShrink: 0 }} />
                <Text strong style={{ fontSize: 13 }}>{comment.user.name}</Text>
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                  {new Date(comment.createdAt).toLocaleString('zh-CN')}
                </Text>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 30 }} dangerouslySetInnerHTML={{
                __html: comment.content.replace(/@(\S+)/g, '<span style="color:#1890ff;font-weight:500">@$1</span>'),
              }} />
              <div style={{ paddingLeft: 30, marginTop: 6 }}>
                <Space size={12}>
                  <Button type="link" size="small" style={{ fontSize: 12, padding: 0 }} onClick={() => setReplyTo(comment.id)}>
                    回复
                  </Button>
                  {(comment.user.id === currentUser?.id || isManager) && (
                    <Popconfirm title="确认删除？" onConfirm={() => handleDeleteComment(comment.id)}>
                      <Button type="link" size="small" danger style={{ fontSize: 12, padding: 0 }}>删除</Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>
            </div>

            {/* Replies */}
            {comment.replies?.map((reply) => (
              <div key={reply.id} style={{ marginLeft: 24, marginTop: 6, padding: '10px 12px', background: '#f0f5ff', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Avatar size={20} icon={<UserOutlined />} style={{ background: '#597ef7', flexShrink: 0 }} />
                  <Text strong style={{ fontSize: 12 }}>{reply.user.name}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                    {new Date(reply.createdAt).toLocaleString('zh-CN')}
                  </Text>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 28 }} dangerouslySetInnerHTML={{
                  __html: reply.content.replace(/@(\S+)/g, '<span style="color:#1890ff;font-weight:500">@$1</span>'),
                }} />
                {(reply.user.id === currentUser?.id || isManager) && (
                  <div style={{ paddingLeft: 28, marginTop: 4 }}>
                    <Popconfirm title="确认删除？" onConfirm={() => handleDeleteComment(reply.id)}>
                      <Button type="link" size="small" danger style={{ fontSize: 12, padding: 0 }}>删除</Button>
                    </Popconfirm>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );

  /* ─────── Tabs ─────── */
  const tabItems = [
    {
      key: 'info',
      label: <span><InfoCircleOutlined /> 信息</span>,
      children: infoTab,
    },
    {
      key: 'versions',
      label: (
        <span>
          <HistoryOutlined /> 版本
          {versions.length > 0 && <Badge count={versions.length} size="small" style={{ marginLeft: 4 }} />}
        </span>
      ),
      children: versionsTab,
    },
    ...(node.isLeaf ? [{
      key: 'approval',
      label: <span><AuditOutlined /> 审批</span>,
      children: approvalTab,
    }] : []),
    {
      key: 'comments',
      label: (
        <span>
          <CommentOutlined /> 评论
          {totalComments > 0 && <Badge count={totalComments} size="small" style={{ marginLeft: 4 }} />}
        </span>
      ),
      children: commentsTab,
    },
  ];

  return (
    <Tabs
      items={tabItems}
      size="small"
      tabBarStyle={{ padding: '0 16px', margin: 0 }}
    />
  );
};

export default PropertiesPanel;
