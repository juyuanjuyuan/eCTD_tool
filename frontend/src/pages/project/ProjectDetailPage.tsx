import React, { useEffect, useState, useCallback } from 'react';
import {
  Typography,
  Tabs,
  Descriptions,
  Tag,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Breadcrumb,
  Spin,
  Result,
  Popconfirm,
  Alert,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SwapOutlined,
  UserAddOutlined,
  CloseCircleOutlined,
  TeamOutlined,
  SearchOutlined,
  MailOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projectApi } from '../../services/project';
import { applicationApi } from '../../services/application';
import { cvApi } from '../../services/cv';
import { userApi, type UserSearchResult } from '../../services/user';
import { dashboardApi, type ProjectProgress, type MemberWorkload } from '../../services/dashboard';
import { useAuthStore } from '../../stores/useAuthStore';
import type {
  Project,
  ProjectMember,
  ProjectInvitation,
  Application,
  ControlledVocabulary,
} from '../../types';

const roleLabels: Record<string, string> = {
  OWNER: '所有者',
  MEMBER: '成员',
  VIEWER: '查看者',
};

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [project, setProject] = useState<(Project & { members: ProjectMember[] }) | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [appTypes, setAppTypes] = useState<ControlledVocabulary[]>([]);
  const [productTypes, setProductTypes] = useState<ControlledVocabulary[]>([]);
  const [appForm] = Form.useForm();
  const [inviteForm] = Form.useForm();
  const [addMemberForm] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [workload, setWorkload] = useState<MemberWorkload[]>([]);
  const [searchUsers, setSearchUsers] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const currentMember = project?.members?.find(
    (m) => m.userId === currentUser?.id,
  );
  const isOwner = currentMember?.role === 'OWNER';

  const loadProject = useCallback(async () => {
    if (!id) return;
    try {
      const data = await projectApi.detail(id);
      setProject(data);
    } catch (e: any) {
      message.error(e.message);
    }
  }, [id]);

  const loadInvitations = useCallback(async () => {
    if (!id || !isOwner) return;
    try {
      const data = await projectApi.listInvitations(id);
      setInvitations(data);
    } catch {
      // Non-owner can't list invitations — ignore
    }
  }, [id, isOwner]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      projectApi.detail(id).then(setProject).catch((e) => message.error(e.message)),
      applicationApi.list(id).then(setApplications).catch((e) => message.error(e.message)),
    ]).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (isOwner && id) {
      projectApi.listInvitations(id).then(setInvitations).catch(() => {});
    }
  }, [isOwner, id]);

  useEffect(() => {
    if (!id) return;
    dashboardApi.getProjectProgress(id).then(setProgress).catch(() => {});
    dashboardApi.getProjectWorkload(id).then(setWorkload).catch(() => {});
  }, [id]);

  // ==================== Application Modal ====================

  const openAppModal = async () => {
    const [at, pt] = await Promise.all([
      cvApi.getApplicationTypes(),
      cvApi.getProductTypes(),
    ]);
    setAppTypes(at);
    setProductTypes(pt);
    setAppModalOpen(true);
  };

  const handleCreateApp = async (values: {
    applicationTypeCode: string;
    productTypeCode: string;
    productNumber: string;
  }) => {
    try {
      await applicationApi.create(id!, values);
      message.success('申请创建成功');
      setAppModalOpen(false);
      appForm.resetFields();
      applicationApi.list(id!).then(setApplications);
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Invite by Email ====================

  const handleInvite = async (values: { email: string; role: string }) => {
    try {
      const result: any = await projectApi.createInvitation(id!, values);
      if (result.directlyAdded) {
        message.success('用户已注册，已直接添加为项目成员');
      } else {
        const link = result.invitation?.inviteLink;
        Modal.success({
          title: '邀请已创建',
          content: (
            <div>
              <p>邀请链接已生成，请将以下链接发送给 {values.email}：</p>
              <Input.TextArea
                value={`${window.location.origin}${link}`}
                autoSize
                readOnly
                style={{ marginTop: 8 }}
              />
            </div>
          ),
        });
      }
      inviteForm.resetFields();
      setInviteModalOpen(false);
      loadProject();
      loadInvitations();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await projectApi.cancelInvitation(id!, invitationId);
      message.success('邀请已取消');
      loadInvitations();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Add Member (search existing users) ====================

  const handleSearchUsers = async (query: string) => {
    if (!query || query.length < 1) {
      setSearchUsers([]);
      return;
    }
    setSearchLoading(true);
    try {
      const users = await userApi.search(query);
      // Filter out existing members
      const existingIds = new Set(project?.members?.map((m) => m.userId) || []);
      setSearchUsers(users.filter((u) => !existingIds.has(u.id)));
    } catch {
      setSearchUsers([]);
    }
    setSearchLoading(false);
  };

  const handleAddMember = async (values: { userId: string; role: string }) => {
    try {
      await projectApi.addMember(id!, values);
      message.success('成员添加成功');
      addMemberForm.resetFields();
      setAddMemberModalOpen(false);
      setSearchUsers([]);
      loadProject();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Role Change ====================

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    try {
      await projectApi.changeMemberRole(id!, targetUserId, { role: newRole });
      message.success('角色已变更');
      loadProject();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Remove Member ====================

  const handleRemoveMember = async (targetUserId: string) => {
    try {
      await projectApi.removeMember(id!, targetUserId);
      message.success('成员已移除');
      loadProject();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Transfer Ownership ====================

  const handleTransferOwnership = async (values: { targetUserId: string }) => {
    try {
      await projectApi.transferOwnership(id!, values);
      message.success('所有权转移成功');
      setTransferModalOpen(false);
      transferForm.resetFields();
      loadProject();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  // ==================== Columns ====================

  const appColumns = [
    {
      title: '申请编号',
      dataIndex: 'applicationNumber',
    },
    {
      title: '申请类型',
      dataIndex: 'applicationTypeCode',
      render: (code: string) => {
        const labels: Record<string, string> = {
          cnapt1: '临床试验申请',
          cnapt2: '新药申请',
          cnapt3: '仿制药申请',
          cnapt4: '原料药申请',
        };
        return labels[code] || code;
      },
    },
    {
      title: '产品类型',
      dataIndex: 'productTypeCode',
      render: (code: string) =>
        code === 'cnprt1' ? '化学药品' : code === 'cnprt2' ? '生物制品' : code,
    },
    { title: '原始编号', dataIndex: 'productNumber' },
    { title: '注册行为数', dataIndex: ['_count', 'regulatoryActivities'] },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (t: string) => new Date(t).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      align: 'right' as const,
      render: (_: unknown, record: Application) => (
        <Button
          type="primary"
          icon={<ArrowRightOutlined />}
          onClick={() => navigate(`/projects/${id}/applications/${record.id}`)}
        >
          进入申请
        </Button>
      ),
    },
  ];

  const memberColumns = [
    { title: '姓名', dataIndex: ['user', 'name'] },
    { title: '邮箱', dataIndex: ['user', 'email'] },
    {
      title: '角色',
      dataIndex: 'role',
      render: (role: string, record: ProjectMember) => {
        if (!isOwner || role === 'OWNER' || record.userId === currentUser?.id) {
          return <Tag color={role === 'OWNER' ? 'gold' : role === 'MEMBER' ? 'blue' : 'default'}>{roleLabels[role]}</Tag>;
        }
        return (
          <Select
            value={role}
            size="small"
            style={{ width: 100 }}
            onChange={(val) => handleRoleChange(record.userId, val)}
            options={[
              { value: 'MEMBER', label: '成员' },
              { value: 'VIEWER', label: '查看者' },
            ]}
          />
        );
      },
    },
    {
      title: '加入时间',
      dataIndex: 'createdAt',
      render: (t: string) => t ? new Date(t).toLocaleDateString('zh-CN') : '-',
    },
    ...(isOwner
      ? [
          {
            title: '操作',
            key: 'actions',
            render: (_: any, record: ProjectMember) => {
              if (record.role === 'OWNER') return null;
              return (
                <Popconfirm
                  title="确认移除该成员？"
                  description="移除后该成员将无法访问项目"
                  onConfirm={() => handleRemoveMember(record.userId)}
                >
                  <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                    移除
                  </Button>
                </Popconfirm>
              );
            },
          },
        ]
      : []),
  ];

  const invitationColumns = [
    { title: '邮箱', dataIndex: 'email' },
    {
      title: '角色',
      dataIndex: 'role',
      render: (role: string) => <Tag>{roleLabels[role]}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: string) => {
        const colors: Record<string, string> = {
          PENDING: 'processing',
          ACCEPTED: 'success',
          EXPIRED: 'default',
          CANCELLED: 'error',
        };
        const labels: Record<string, string> = {
          PENDING: '待接受',
          ACCEPTED: '已接受',
          EXPIRED: '已过期',
          CANCELLED: '已取消',
        };
        return <Tag color={colors[status]}>{labels[status] || status}</Tag>;
      },
    },
    {
      title: '邀请人',
      dataIndex: ['inviter', 'name'],
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      render: (t: string) => new Date(t).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: ProjectInvitation) => {
        if (record.status !== 'PENDING') return null;
        return (
          <Button
            type="link"
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => handleCancelInvitation(record.id)}
          >
            取消
          </Button>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!project) {
    return <Result status="404" title="项目不存在" subTitle="请检查链接是否正确，或返回项目列表" />;
  }

  const nonOwnerMembers = project.members?.filter((m) => m.role !== 'OWNER' && m.userId !== currentUser?.id) || [];

  return (
    <div>
      <Breadcrumb
        items={[
          { title: <Link to="/projects">项目列表</Link> },
          { title: project.name },
        ]}
        style={{ marginBottom: 16 }}
      />
      <Typography.Title level={4}>{project.name}</Typography.Title>

      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <>
                <Descriptions bordered column={2} style={{ marginBottom: 24 }}>
                  <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Tag color={project.status === 'ACTIVE' ? 'green' : 'default'}>
                      {project.status === 'ACTIVE' ? '进行中' : project.status === 'ARCHIVED' ? '已归档' : '草稿'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="描述" span={2}>
                    {project.description || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">
                    {new Date(project.createdAt).toLocaleString('zh-CN')}
                  </Descriptions.Item>
                </Descriptions>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    申请 ({applications.length})
                  </Typography.Title>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAppModal}>
                    创建申请
                  </Button>
                </div>
                <Table
                  rowKey="id"
                  columns={appColumns}
                  dataSource={applications}
                  pagination={false}
                />
              </>
            ),
          },
          {
            key: 'members',
            label: `成员 (${project.members?.length || 0})`,
            children: (
              <>
                {/* Action buttons — always show add member for OWNER */}
                <Space style={{ marginBottom: 16 }}>
                  {isOwner && (
                    <>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => setAddMemberModalOpen(true)}
                      >
                        添加成员
                      </Button>
                      <Button
                        icon={<MailOutlined />}
                        onClick={() => setInviteModalOpen(true)}
                      >
                        邮箱邀请
                      </Button>
                      <Button
                        icon={<SwapOutlined />}
                        onClick={() => setTransferModalOpen(true)}
                      >
                        转移所有权
                      </Button>
                    </>
                  )}
                  {!isOwner && currentMember && (
                    <Typography.Text type="secondary">
                      您的角色: <Tag>{roleLabels[currentMember.role]}</Tag>
                      {currentMember.role !== 'OWNER' && '（仅所有者可管理成员）'}
                    </Typography.Text>
                  )}
                </Space>
                <Table
                  rowKey="id"
                  dataSource={project.members}
                  columns={memberColumns}
                  pagination={false}
                />

                {isOwner && invitations.length > 0 && (
                  <>
                    <Typography.Title level={5} style={{ marginTop: 24 }}>
                      邀请记录
                    </Typography.Title>
                    <Table
                      rowKey="id"
                      dataSource={invitations}
                      columns={invitationColumns}
                      pagination={false}
                      size="small"
                    />
                  </>
                )}
              </>
            ),
          },
          {
            key: 'collaboration',
            label: (
              <span>
                <TeamOutlined /> 协作
              </span>
            ),
            children: (
              <div>
                {/* Progress overview */}
                <Typography.Title level={5}>团队进度总览</Typography.Title>
                {progress && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ marginBottom: 12 }}>
                      <Typography.Text>
                        总体进度：{progress.approvedNodes} / {progress.totalNodes} 个章节已通过
                        {progress.totalNodes > 0 && (
                          <Tag color="blue" style={{ marginLeft: 8 }}>
                            {Math.round((progress.approvedNodes / progress.totalNodes) * 100)}%
                          </Tag>
                        )}
                      </Typography.Text>
                    </div>
                    <Table
                      rowKey="module"
                      size="small"
                      pagination={false}
                      dataSource={Object.entries(progress.modules).map(([module, stats]) => ({
                        module,
                        ...stats,
                      }))}
                      columns={[
                        { title: '模块', dataIndex: 'module', width: 100 },
                        { title: '总章节', dataIndex: 'total', width: 100 },
                        { title: '已通过', dataIndex: 'approved', width: 100 },
                        {
                          title: '进度',
                          render: (_: any, r: any) => (
                            <div style={{
                              width: '100%',
                              height: 8,
                              background: '#f0f0f0',
                              borderRadius: 4,
                            }}>
                              <div style={{
                                width: r.total > 0 ? `${(r.approved / r.total) * 100}%` : '0%',
                                height: '100%',
                                background: '#52c41a',
                                borderRadius: 4,
                                transition: 'width 0.3s',
                              }} />
                            </div>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}

                {/* Workload distribution */}
                <Typography.Title level={5}>成员工作量分布</Typography.Title>
                <Table
                  rowKey="userId"
                  size="small"
                  pagination={false}
                  dataSource={workload}
                  columns={[
                    { title: '成员', dataIndex: 'name' },
                    { title: '角色', dataIndex: 'role', render: (r: string) => <Tag>{roleLabels[r]}</Tag> },
                    { title: '指派章节', dataIndex: 'assigned' },
                    {
                      title: '已通过',
                      dataIndex: 'approved',
                      render: (v: number) => <Tag color="green">{v}</Tag>,
                    },
                    {
                      title: '编辑中',
                      dataIndex: 'editing',
                      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : 0,
                    },
                    {
                      title: '待审阅',
                      dataIndex: 'pendingReview',
                      render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : 0,
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      {/* Create Application Modal */}
      <Modal
        title="创建申请"
        open={appModalOpen}
        onCancel={() => { setAppModalOpen(false); appForm.resetFields(); }}
        onOk={() => appForm.submit()}
        width={520}
      >
        <Form form={appForm} layout="vertical" onFinish={handleCreateApp}>
          <Form.Item
            name="applicationTypeCode"
            label="申请类型"
            rules={[{ required: true, message: '请选择申请类型' }]}
          >
            <Select placeholder="选择申请类型">
              {appTypes.map((t) => (
                <Select.Option key={t.code} value={t.code}>
                  {t.descriptionZh} ({t.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="productTypeCode"
            label="产品类型"
            rules={[{ required: true, message: '请选择产品类型' }]}
          >
            <Select placeholder="选择产品类型">
              {productTypes.map((t) => (
                <Select.Option key={t.code} value={t.code}>
                  {t.descriptionZh} ({t.code})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="productNumber"
            label="原始编号"
            rules={[
              { required: true, message: '请输入原始编号' },
              { pattern: /^\d{10}$/, message: '原始编号必须为10位数字' },
            ]}
          >
            <Input placeholder="10位数字，如 2026123456" maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Member Modal (search existing users) */}
      <Modal
        title="添加成员"
        open={addMemberModalOpen}
        onCancel={() => { setAddMemberModalOpen(false); addMemberForm.resetFields(); setSearchUsers([]); }}
        onOk={() => addMemberForm.submit()}
        width={480}
      >
        <Form form={addMemberForm} layout="vertical" onFinish={handleAddMember}>
          <Form.Item
            name="userId"
            label="搜索用户"
            rules={[{ required: true, message: '请选择用户' }]}
          >
            <Select
              showSearch
              placeholder="输入姓名或邮箱搜索已注册用户"
              filterOption={false}
              onSearch={handleSearchUsers}
              loading={searchLoading}
              notFoundContent={searchLoading ? '搜索中...' : '未找到用户'}
              options={searchUsers.map((u) => ({
                value: u.id,
                label: (
                  <span>
                    {u.name} <Typography.Text type="secondary">({u.email})</Typography.Text>
                  </span>
                ),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
            initialValue="MEMBER"
          >
            <Select>
              <Select.Option value="MEMBER">成员（可编辑）</Select.Option>
              <Select.Option value="VIEWER">查看者（只读）</Select.Option>
            </Select>
          </Form.Item>
        </Form>
        <Divider plain style={{ fontSize: 12 }}>
          找不到用户？
        </Divider>
        <Button
          block
          icon={<MailOutlined />}
          onClick={() => { setAddMemberModalOpen(false); setInviteModalOpen(true); }}
        >
          通过邮箱邀请未注册用户
        </Button>
      </Modal>

      {/* Invite by Email Modal */}
      <Modal
        title="邮箱邀请"
        open={inviteModalOpen}
        onCancel={() => { setInviteModalOpen(false); inviteForm.resetFields(); }}
        onOk={() => inviteForm.submit()}
        width={480}
      >
        <Alert
          type="info"
          showIcon
          message="输入邮箱地址邀请用户加入项目"
          description="如果对方已注册，将直接添加为成员；如果未注册，将生成邀请链接。"
          style={{ marginBottom: 16 }}
        />
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="输入被邀请人的邮箱地址" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
            initialValue="MEMBER"
          >
            <Select>
              <Select.Option value="MEMBER">成员（可编辑）</Select.Option>
              <Select.Option value="VIEWER">查看者（只读）</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Transfer Ownership Modal */}
      <Modal
        title="转移所有权"
        open={transferModalOpen}
        onCancel={() => { setTransferModalOpen(false); transferForm.resetFields(); }}
        onOk={() => transferForm.submit()}
        width={480}
      >
        <Alert
          type="warning"
          showIcon
          message="此操作不可撤销"
          description="转移所有权后，您将降级为普通成员，新所有者将拥有完全管理权限。"
          style={{ marginBottom: 16 }}
        />
        <Form form={transferForm} layout="vertical" onFinish={handleTransferOwnership}>
          <Form.Item
            name="targetUserId"
            label="转移给"
            rules={[{ required: true, message: '请选择目标成员' }]}
          >
            <Select placeholder="选择项目成员">
              {nonOwnerMembers.map((m) => (
                <Select.Option key={m.userId} value={m.userId}>
                  {m.user.name} ({m.user.email})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectDetailPage;
