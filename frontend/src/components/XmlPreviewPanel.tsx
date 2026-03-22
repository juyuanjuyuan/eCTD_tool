import React, { useState } from 'react';
import { Card, Button, Tabs, Spin, message, Typography } from 'antd';
import { CodeOutlined, ReloadOutlined } from '@ant-design/icons';
import { ectdApi } from '../services/ectd';

const { Text } = Typography;

interface Props {
  sequenceId: string;
}

const XmlPreviewPanel: React.FC<Props> = ({ sequenceId }) => {
  const [cnRegionalXml, setCnRegionalXml] = useState<string>('');
  const [indexXml, setIndexXml] = useState<string>('');
  const [loadingCn, setLoadingCn] = useState(false);
  const [loadingIndex, setLoadingIndex] = useState(false);

  const fetchCnRegional = async () => {
    setLoadingCn(true);
    try {
      const data = await ectdApi.previewCnRegionalXml(sequenceId);
      setCnRegionalXml(data.xml || '');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoadingCn(false);
    }
  };

  const fetchIndex = async () => {
    setLoadingIndex(true);
    try {
      const data = await ectdApi.previewIndexXml(sequenceId);
      setIndexXml(data.xml || '');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoadingIndex(false);
    }
  };

  return (
    <Card title="XML 骨架文件预览" size="small">
      <Tabs
        items={[
          {
            key: 'cn-regional',
            label: 'cn-regional.xml (模块一)',
            children: (
              <div>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchCnRegional}
                  loading={loadingCn}
                  style={{ marginBottom: 8 }}
                >
                  生成预览
                </Button>
                {loadingCn ? (
                  <Spin />
                ) : cnRegionalXml ? (
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 500,
                      overflow: 'auto',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {cnRegionalXml}
                  </pre>
                ) : (
                  <Text type="secondary">点击"生成预览"查看 cn-regional.xml</Text>
                )}
              </div>
            ),
          },
          {
            key: 'index',
            label: 'index.xml (模块二至五)',
            children: (
              <div>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchIndex}
                  loading={loadingIndex}
                  style={{ marginBottom: 8 }}
                >
                  生成预览
                </Button>
                {loadingIndex ? (
                  <Spin />
                ) : indexXml ? (
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: 12,
                      borderRadius: 4,
                      maxHeight: 500,
                      overflow: 'auto',
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  >
                    {indexXml}
                  </pre>
                ) : (
                  <Text type="secondary">点击"生成预览"查看 index.xml</Text>
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default XmlPreviewPanel;
