import React, { useState, useCallback, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Tag,
  Statistic,
  Row,
  Col,
  Spin,
  message,
  Alert,
  Select,
  Typography,
  Empty,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { ectdApi } from '../services/ectd';

const { Text } = Typography;

interface ValidationItem {
  id: string;
  ruleCode: string;
  ruleCategory: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  description: string;
  detail?: string;
  filePath?: string;
  suggestion?: string;
}

interface ValidationReport {
  id: string;
  sequenceId: string;
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  isPassed: boolean;
  createdAt: string;
  items: ValidationItem[];
}

const severityConfig = {
  ERROR: { color: 'red', icon: <CloseCircleOutlined />, label: '错误' },
  WARNING: { color: 'orange', icon: <WarningOutlined />, label: '警告' },
  INFO: { color: 'blue', icon: <InfoCircleOutlined />, label: '提示' },
};

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '基础识别', value: '基础识别' },
  { label: '文件/文件夹', value: '文件/文件夹' },
  { label: 'ICH骨架文件', value: 'ICH骨架文件' },
  { label: '区域性管理信息', value: '区域性管理信息' },
  { label: 'STF', value: 'STF' },
  { label: 'PDF分析', value: 'PDF分析' },
];

interface Props {
  sequenceId: string;
  onValidationComplete?: (isPassed: boolean) => void;
}

const ValidationPanel: React.FC<Props> = ({ sequenceId, onValidationComplete }) => {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const fetchLatestReport = useCallback(async () => {
    try {
      setLoading(true);
      const data = await ectdApi.getLatestReport(sequenceId) as any;
      setReport(data);
    } catch {
      // No report yet
    } finally {
      setLoading(false);
    }
  }, [sequenceId]);

  useEffect(() => {
    fetchLatestReport().then(() => {
      // Notify parent of existing report status on mount
    });
  }, [fetchLatestReport]);

  // When report is loaded (including on mount), propagate validation status to parent
  useEffect(() => {
    if (report) {
      onValidationComplete?.(report.isPassed);
    }
  }, [report]);

  const handleRunValidation = async () => {
    setRunning(true);
    try {
      const result = await ectdApi.runValidation(sequenceId) as any;
      message.success(
        result.isPassed
          ? '验证通过！可以导出 eCTD 包'
          : `验证完成，有 ${result.totalErrors} 个错误需要修复`,
      );
      await fetchLatestReport();
      onValidationComplete?.(result.isPassed);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  const filteredItems = (report?.items || []).filter((item) => {
    if (categoryFilter !== 'all' && item.ruleCategory !== categoryFilter) return false;
    if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
    return true;
  });

  const columns = [
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (severity: string) => {
        const config = severityConfig[severity as keyof typeof severityConfig];
        return (
          <Tag color={config?.color} icon={config?.icon}>
            {config?.label}
          </Tag>
        );
      },
    },
    {
      title: '规则',
      dataIndex: 'ruleCode',
      key: 'ruleCode',
      width: 80,
    },
    {
      title: '类别',
      dataIndex: 'ruleCategory',
      key: 'ruleCategory',
      width: 120,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      ellipsis: true,
      render: (text: string) => <Text type="secondary">{text}</Text>,
    },
    {
      title: '文件',
      dataIndex: 'filePath',
      key: 'filePath',
      width: 200,
      ellipsis: true,
      render: (text: string) =>
        text ? <Text code>{text}</Text> : '-',
    },
    {
      title: '修复建议',
      dataIndex: 'suggestion',
      key: 'suggestion',
      width: 200,
      ellipsis: true,
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={running}
            onClick={handleRunValidation}
          >
            运行验证
          </Button>
        }
      >
        {report ? (
          <>
            <Alert
              type={report.isPassed ? 'success' : 'error'}
              message={
                report.isPassed
                  ? '验证通过 — 可以导出 eCTD 提交包'
                  : `验证未通过 — 有 ${report.totalErrors} 个错误需要修复`
              }
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="错误"
                  value={report.totalErrors}
                  valueStyle={{
                    color: report.totalErrors > 0 ? '#cf1322' : '#3f8600',
                  }}
                  prefix={<CloseCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="警告"
                  value={report.totalWarnings}
                  valueStyle={{
                    color: report.totalWarnings > 0 ? '#faad14' : '#3f8600',
                  }}
                  prefix={<WarningOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="提示"
                  value={report.totalInfos}
                  prefix={<InfoCircleOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="状态"
                  value={report.isPassed ? '通过' : '未通过'}
                  valueStyle={{
                    color: report.isPassed ? '#3f8600' : '#cf1322',
                  }}
                  prefix={
                    report.isPassed ? (
                      <CheckCircleOutlined />
                    ) : (
                      <CloseCircleOutlined />
                    )
                  }
                />
              </Col>
            </Row>
          </>
        ) : (
          <Empty description="尚未运行验证" />
        )}
      </Card>

      {report && report.items.length > 0 && (
        <Card
          title="验证明细"
          size="small"
          extra={
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                value={severityFilter}
                onChange={setSeverityFilter}
                style={{ width: 100 }}
                options={[
                  { label: '全部级别', value: 'all' },
                  { label: '错误', value: 'ERROR' },
                  { label: '警告', value: 'WARNING' },
                  { label: '提示', value: 'INFO' },
                ]}
              />
              <Select
                value={categoryFilter}
                onChange={setCategoryFilter}
                style={{ width: 150 }}
                options={categoryOptions}
              />
            </div>
          }
        >
          <Table
            dataSource={filteredItems}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          />
        </Card>
      )}
    </div>
  );
};

export default ValidationPanel;
