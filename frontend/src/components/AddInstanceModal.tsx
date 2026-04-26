import { useEffect } from 'react';
import { Modal, Form, Input, message } from 'antd';
import type { CtdTemplateNode } from '../types';
import { ctdApi } from '../services/ctd';

interface Props {
  open: boolean;
  seqId: string;
  template: CtdTemplateNode | null;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Plan 13 (2026-04-23): 为可重复模板节点添加实例.
 * 根据 template.instanceKeyFields 动态渲染必填输入框:
 *   - ["substance","manufacturer"] -> 原料药 + 生产商
 *   - ["productName","dosageForm","manufacturer"] -> 产品名称 + 剂型 + 生产商
 *   - ["indication"] -> 适应症
 */
const FIELD_LABEL: Record<string, string> = {
  substance: '原料药 (substance)',
  manufacturer: '生产商 (manufacturer)',
  productName: '产品名称 (product-name)',
  dosageForm: '剂型 (dosageform)',
  indication: '适应症 (indication)',
};

export default function AddInstanceModal({ open, seqId, template, onClose, onAdded }: Props) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  if (!template) return null;
  // Defensive: backend may ship instanceKeyFields as a JSON string (SQLite mode
  // historically did this). Coerce to array so `.map` below never crashes with
  // "o.map is not a function". Backend now also normalizes — keep this as a belt.
  const rawKeys = template.instanceKeyFields as unknown;
  let keys: string[] = [];
  if (Array.isArray(rawKeys)) {
    keys = rawKeys as string[];
  } else if (typeof rawKeys === 'string') {
    try { const parsed = JSON.parse(rawKeys); if (Array.isArray(parsed)) keys = parsed; } catch { /* keep [] */ }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await ctdApi.addInstance(seqId, template.id, values);
      message.success(`已添加 ${template.titleZh} 实例`);
      onAdded();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      if (err?.response?.data?.message) {
        message.error(err.response.data.message);
      }
    }
  };

  return (
    <Modal
      title={`添加${template.titleZh}实例`}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      okText="添加"
      cancelText="取消"
      destroyOnClose
    >
      <p style={{ color: '#666', marginBottom: 16 }}>
        该章节支持多实例 (如多个原料药 / 多个制剂 / 多个适应症). 请至少填写一项区分键字段.
      </p>
      <Form form={form} layout="vertical">
        {keys.map((k) => (
          <Form.Item
            key={k}
            name={k}
            label={FIELD_LABEL[k] ?? k}
            rules={[{ max: k === 'indication' ? 500 : 200, message: '长度超出限制' }]}
          >
            <Input placeholder={`请填写 ${FIELD_LABEL[k] ?? k}`} />
          </Form.Item>
        ))}
      </Form>
    </Modal>
  );
}
