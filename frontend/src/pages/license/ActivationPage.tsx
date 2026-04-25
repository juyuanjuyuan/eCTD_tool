import React, { useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Form,
  Input,
  Button,
  Space,
  Alert,
  Descriptions,
  Tag,
  message,
} from 'antd';
import { CopyOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLicenseStore, isLicenseBlocking } from '../../stores/useLicenseStore';

const { Title, Paragraph, Text } = Typography;

const ActivationPage: React.FC = () => {
  const navigate = useNavigate();
  const { status, fetch, activate, loading, error } = useLicenseStore();
  const [code, setCode] = useState('');

  useEffect(() => {
    fetch();
  }, [fetch]);

  const onCopyMachineId = async () => {
    if (!status?.machineId) return;
    try {
      await navigator.clipboard.writeText(status.machineId);
      message.success('机器指纹已复制');
    } catch {
      message.error('复制失败，请手动选中复制');
    }
  };

  const onSubmit = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      message.warning('请粘贴激活码');
      return;
    }
    try {
      const next = await activate(trimmed);
      if (next.activated && next.license?.valid) {
        message.success('激活成功');
        navigate('/projects', { replace: true });
      } else {
        message.error(reasonText(next.license?.reason) || '激活未通过');
      }
    } catch (err: any) {
      message.error(err?.message || '激活失败');
    }
  };

  const blocking = isLicenseBlocking(status);

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
        padding: 24,
      }}
    >
      <Card style={{ width: 640 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <KeyOutlined style={{ fontSize: 32, color: '#1677ff' }} />
            <Title level={3} style={{ marginTop: 8, marginBottom: 4 }}>
              激活 eCTD 文档工具
            </Title>
            <Text type="secondary">单机授权 · 一年有效期 · 一台设备一码</Text>
          </div>

          {blocking && status?.activated && (
            <Alert
              type="error"
              showIcon
              message="本机激活已失效"
              description={reasonText(status.license?.reason) || '请联系厂商重新签发激活码'}
            />
          )}

          {!status?.activated && (
            <Alert
              type="info"
              showIcon
              message="本机尚未激活"
              description="请把下方机器指纹发送给厂商，由厂商签发与本机绑定的激活码后回传给您。"
            />
          )}

          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="本机指纹">
              <Space>
                <Text code copyable={{ text: status?.machineId || '' }}>
                  {status?.machineId || '加载中...'}
                </Text>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={onCopyMachineId}
                  disabled={!status?.machineId}
                >
                  复制
                </Button>
              </Space>
            </Descriptions.Item>
            {status?.license && (
              <>
                <Descriptions.Item label="客户名称">
                  {status.license.customer}
                </Descriptions.Item>
                <Descriptions.Item label="授权期">
                  {status.license.issuedAt} 至 {status.license.expiresAt}
                </Descriptions.Item>
                <Descriptions.Item label="剩余天数">
                  <Tag color={status.license.daysRemaining > 30 ? 'green' : status.license.daysRemaining > 0 ? 'orange' : 'red'}>
                    {status.license.daysRemaining > 0
                      ? `${status.license.daysRemaining} 天`
                      : '已过期'}
                  </Tag>
                </Descriptions.Item>
              </>
            )}
          </Descriptions>

          <Form layout="vertical">
            <Form.Item label="激活码" required>
              <Input.TextArea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                rows={4}
                placeholder="将厂商发来的激活码原样粘贴到此处（含中间的英文句点 .）"
                autoSize={{ minRows: 4, maxRows: 8 }}
              />
            </Form.Item>
            {error && <Alert type="error" showIcon message={error} closable />}
            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  loading={loading}
                  onClick={onSubmit}
                >
                  激活
                </Button>
                <Button icon={<ReloadOutlined />} onClick={() => fetch()} loading={loading}>
                  刷新状态
                </Button>
              </Space>
            </Form.Item>
          </Form>

          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            机器指纹由本机硬件信息生成（CPU + 主板序列号 + 网卡 MAC），换硬件或拷贝到其他设备后会变化，需要重新申请激活码。
          </Paragraph>
        </Space>
      </Card>
    </div>
  );
};

function reasonText(reason?: string): string {
  switch (reason) {
    case 'expired':
      return '激活码已过期。请联系厂商续期。';
    case 'fingerprint-mismatch':
      return '激活码与本机指纹不匹配（可能是拷贝来的或换了硬件）。';
    case 'bad-signature':
      return '激活码签名无效（可能被篡改或来源非法）。';
    case 'malformed':
      return '激活码格式错误。';
    case 'not-yet-valid':
      return '激活码还未到生效日期。';
    default:
      return '';
  }
}

export default ActivationPage;
