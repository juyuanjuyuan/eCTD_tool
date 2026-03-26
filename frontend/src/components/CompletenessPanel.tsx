import React from 'react';
import { Card, Progress, Row, Col, List, Tag, Statistic, Empty, Tooltip } from 'antd';
import {
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
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

  const hasRequiredSections = data.requiredSections > 0;
  const completionPercent = hasRequiredSections
    ? Math.round((data.completedRequired / data.requiredSections) * 100)
    : 0;

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
              value={hasRequiredSections ? data.requiredSections : undefined}
              formatter={hasRequiredSections ? undefined : () => '无'}
              suffix={hasRequiredSections ? '个' : undefined}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            {hasRequiredSections ? (
              <Statistic
                title="已完成必填"
                value={data.completedRequired}
                suffix={`/ ${data.requiredSections}`}
                valueStyle={{
                  color: data.completedRequired === data.requiredSections ? '#52c41a' : '#faad14',
                }}
              />
            ) : (
              <Statistic
                title="已完成必填"
                value={undefined}
                formatter={() => '无必填要求'}
                valueStyle={{ color: '#8c8c8c', fontSize: 16 }}
              />
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
                完成度
              </div>
              {hasRequiredSections ? (
                <Progress
                  type="circle"
                  percent={completionPercent}
                  size={64}
                  status={completionPercent === 100 ? 'success' : 'active'}
                />
              ) : (
                <Progress
                  type="circle"
                  percent={0}
                  size={64}
                  format={() => 'N/A'}
                />
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {Object.entries(data.moduleStats).map(([mod, stats]) => {
          const hasRules = stats.required > 0;
          const percent = hasRules
            ? Math.round((stats.completed / stats.required) * 100)
            : (stats.total > 0 ? undefined : undefined);

          return (
            <Col span={Math.floor(24 / Object.keys(data.moduleStats).length)} key={mod}>
              <Card size="small" title={mod}>
                {hasRules ? (
                  <>
                    <Progress
                      percent={percent}
                      size="small"
                      status={stats.completed >= stats.required ? 'success' : 'active'}
                    />
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                      {stats.completed}/{stats.required} 必填 · {stats.total} 总计
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '4px 0' }}>
                    <Tooltip title="根据 eCTD 验证标准 V1.1 第 4.3 节，该模块无自动化必填规则，内容由申报人根据申请类型自行决定">
                      <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                        无必填规则 · {stats.total} 总计
                        <InfoCircleOutlined style={{ marginLeft: 4, cursor: 'help' }} />
                      </div>
                    </Tooltip>
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
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
