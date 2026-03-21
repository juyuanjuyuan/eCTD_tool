import React from 'react';
import { Card, Progress, Row, Col, List, Tag, Statistic, Empty } from 'antd';
import {
  ExclamationCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { CompletenessResult } from '../types';

interface CompletenessPanelProps {
  data: CompletenessResult | null;
}

export const CompletenessPanel: React.FC<CompletenessPanelProps> = ({
  data,
}) => {
  if (!data) {
    return <Empty description="暂无完整性数据" />;
  }

  const completionPercent =
    data.requiredSections > 0
      ? Math.round((data.completedRequired / data.requiredSections) * 100)
      : 100;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="总章节数"
              value={data.totalSections}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="必填章节"
              value={data.requiredSections}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已完成必填"
              value={data.completedRequired}
              suffix={`/ ${data.requiredSections}`}
              valueStyle={{
                color: data.completedRequired === data.requiredSections ? '#52c41a' : '#faad14',
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
                完成度
              </div>
              <Progress
                type="circle"
                percent={completionPercent}
                size={64}
                status={completionPercent === 100 ? 'success' : 'active'}
              />
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {Object.entries(data.moduleStats).map(([mod, stats]) => (
          <Col span={Math.floor(24 / Object.keys(data.moduleStats).length)} key={mod}>
            <Card size="small" title={mod}>
              <Progress
                percent={
                  stats.required > 0
                    ? Math.round((stats.completed / stats.required) * 100)
                    : 100
                }
                size="small"
                status={stats.completed >= stats.required ? 'success' : 'active'}
              />
              <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                {stats.completed}/{stats.required} 必填 · {stats.total} 总计
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {data.missingRequired.length > 0 && (
        <Card
          size="small"
          title={
            <span>
              <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              未完成的必填章节 ({data.missingRequired.length})
            </span>
          }
          style={{ marginTop: 16 }}
        >
          <List
            size="small"
            dataSource={data.missingRequired}
            renderItem={(item) => (
              <List.Item>
                <span>
                  <Tag color={item.severity === 'ERROR' ? 'red' : 'orange'}>
                    {item.section}
                  </Tag>
                  {item.title}
                </span>
              </List.Item>
            )}
          />
        </Card>
      )}

      {data.forbiddenViolations.length > 0 && (
        <Card
          size="small"
          title={
            <span>
              <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              禁止使用的章节有内容 ({data.forbiddenViolations.length})
            </span>
          }
          style={{ marginTop: 16 }}
        >
          <List
            size="small"
            dataSource={data.forbiddenViolations}
            renderItem={(item) => (
              <List.Item>
                <span>
                  <Tag color="red">{item.section}</Tag>
                  {item.title}
                </span>
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default CompletenessPanel;
