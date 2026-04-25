import React from 'react';
import {
  Card,
  Descriptions,
  Typography,
  Space,
  Button,
  Tag,
  message,
  Divider,
} from 'antd';
import { CopyOutlined, FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons';
import { useEnvironment } from '../../contexts/EnvironmentContext';
import { useLicenseStore } from '../../stores/useLicenseStore';

const { Title, Text, Paragraph } = Typography;

const AboutPage: React.FC = () => {
  const env = useEnvironment();
  const license = useLicenseStore((s) => s.status);

  const copy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => message.success(`${label}已复制`))
      .catch(() => message.error('复制失败'));
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              eCTD 文档工具
            </Title>
            <Text type="secondary">药品注册申报资料在线编辑与管理平台</Text>
          </div>

          <Descriptions column={1} bordered size="small" title="运行环境">
            <Descriptions.Item label="形态">
              {env.isDesktop ? (
                <Tag color="blue">桌面单机版（Electron）</Tag>
              ) : (
                <Tag>Web 版</Tag>
              )}
            </Descriptions.Item>
            {env.isDesktop && (
              <>
                <Descriptions.Item label="软件版本">
                  {env.appVersion ?? '加载中...'}
                </Descriptions.Item>
                <Descriptions.Item label="平台">
                  {env.platform ?? '加载中...'}
                </Descriptions.Item>
                <Descriptions.Item label="机器指纹">
                  <Space>
                    <Text code>{env.machineId ?? '加载中...'}</Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => env.machineId && copy(env.machineId, '机器指纹')}
                      disabled={!env.machineId}
                    >
                      复制
                    </Button>
                  </Space>
                </Descriptions.Item>
              </>
            )}
            {!env.isDesktop && license?.machineId && (
              <Descriptions.Item label="后端机器指纹">
                <Text code>{license.machineId}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          {license && license.enforced && (
            <Descriptions column={1} bordered size="small" title="授权状态">
              <Descriptions.Item label="状态">
                {license.activated && license.license?.valid ? (
                  <Tag color="green">已激活</Tag>
                ) : license.activated ? (
                  <Tag color="red">已失效</Tag>
                ) : (
                  <Tag color="red">未激活</Tag>
                )}
              </Descriptions.Item>
              {license.license && (
                <>
                  <Descriptions.Item label="客户名称">
                    {license.license.customer}
                  </Descriptions.Item>
                  <Descriptions.Item label="授权期">
                    {license.license.issuedAt} 至 {license.license.expiresAt}
                  </Descriptions.Item>
                  <Descriptions.Item label="剩余天数">
                    <Tag
                      color={
                        license.license.daysRemaining > 30
                          ? 'green'
                          : license.license.daysRemaining > 0
                            ? 'orange'
                            : 'red'
                      }
                    >
                      {license.license.daysRemaining > 0
                        ? `${license.license.daysRemaining} 天`
                        : '已过期'}
                    </Tag>
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
          )}

          {env.isDesktop && (
            <>
              <Divider style={{ margin: 0 }} />
              <Space>
                <Button
                  icon={<FolderOpenOutlined />}
                  onClick={() => window.electronAPI?.openDataDir()}
                >
                  打开数据目录
                </Button>
                <Button
                  icon={<FileTextOutlined />}
                  onClick={() => window.electronAPI?.openLogFile()}
                >
                  查看日志
                </Button>
              </Space>
            </>
          )}

          <Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>
            如遇问题，请把上方机器指纹复制后联系厂商技术支持。
          </Paragraph>
        </Space>
      </Card>
    </div>
  );
};

export default AboutPage;
