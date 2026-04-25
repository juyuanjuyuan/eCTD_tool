import React from 'react';
import { Tag, Tooltip } from 'antd';
import { KeyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useLicenseStore } from '../stores/useLicenseStore';

/**
 * Compact license-status indicator shown in the top header.
 *
 * - Always renders when enforcement is on, so the user can see remaining days at a glance.
 * - Color: green (>30d) → orange (≤30d) → red (≤7d or invalid).
 * - Click → /activation page.
 */
const LicenseBanner: React.FC = () => {
  const navigate = useNavigate();
  const status = useLicenseStore((s) => s.status);

  if (!status || !status.enforced) {
    return null;
  }

  if (!status.activated) {
    return (
      <Tag
        icon={<KeyOutlined />}
        color="red"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/activation')}
      >
        未激活，点此激活
      </Tag>
    );
  }

  const lic = status.license;
  if (!lic) return null;

  const days = lic.daysRemaining;
  const valid = lic.valid;

  let color: string;
  let text: string;
  if (!valid) {
    color = 'red';
    text = '激活已失效';
  } else if (days <= 0) {
    color = 'red';
    text = '已过期';
  } else if (days <= 7) {
    color = 'red';
    text = `剩余 ${days} 天`;
  } else if (days <= 30) {
    color = 'orange';
    text = `剩余 ${days} 天`;
  } else {
    color = 'green';
    text = `剩余 ${days} 天`;
  }

  return (
    <Tooltip
      title={
        <div>
          <div>客户：{lic.customer}</div>
          <div>授权至：{lic.expiresAt}</div>
          <div>点击查看 / 重新激活</div>
        </div>
      }
    >
      <Tag
        icon={<KeyOutlined />}
        color={color}
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/activation')}
      >
        {text}
      </Tag>
    </Tooltip>
  );
};

export default LicenseBanner;
