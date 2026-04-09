import React, { useState, useEffect, useCallback } from 'react';
import {
  Button,
  List,
  Space,
  Typography,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Collapse,
  message,
  Popconfirm,
  Empty,
  Spin,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  ImportOutlined,
  DeleteOutlined,
  EditOutlined,
  ReloadOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { studyApi, type Study, type CreateStudyDto, type StudyOperation } from '../services/study';
import { cvApi, type StfCategoryGroup, type StfFileTag } from '../services/cv';
import { fileApi, type FileAttachment } from '../services/file';
import StudyImportModal from './StudyImportModal';

const { Text } = Typography;

interface StudyMetadataPanelProps {
  nodeId: string;
  ctdSectionNumber: string;
  /** Pre-fetched defaultStfCategories from CtdTemplateNode (Plan 12 §2.2). */
  defaultStfCategories?: Array<{ name: string; required?: boolean }>;
}

const operationOptions: Array<{ label: string; value: StudyOperation }> = [
  { label: '新建 (new)', value: 'NEW' },
  { label: '替换 (replace)', value: 'REPLACE' },
  { label: '增补 (append)', value: 'APPEND' },
  { label: '删除 (delete)', value: 'DELETE' },
];

/**
 * Plan 12 §4.1 — Study metadata panel for STF-required CTD leaves (M4 4.2.x
 * and M5 5.3.1-5.3.5). Shows existing studies, supports create / edit /
 * delete, and exposes the import-from-XML modal (Plan 12 §4.3).
 */
const StudyMetadataPanel: React.FC<StudyMetadataPanelProps> = ({
  nodeId,
  ctdSectionNumber,
  defaultStfCategories,
}) => {
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(false);
  const [allCategories, setAllCategories] = useState<StfCategoryGroup[]>([]);
  const [fileTags, setFileTags] = useState<StfFileTag[]>([]);
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStudy, setEditingStudy] = useState<Study | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const moduleKey: 'm4' | 'm5' = ctdSectionNumber.startsWith('4.') ? 'm4' : 'm5';

  const loadStudies = useCallback(async () => {
    if (!nodeId) return;
    setLoading(true);
    try {
      const list = await studyApi.listByNode(nodeId);
      setStudies(list);
    } catch (err: any) {
      message.error(`加载研究列表失败: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  const loadVocabularies = useCallback(async () => {
    try {
      const [cats, tags, fileList] = await Promise.all([
        cvApi.getStfCategories(),
        cvApi.getStfFileTags(moduleKey),
        fileApi.list(nodeId),
      ]);
      setAllCategories(cats);
      setFileTags(tags);
      setFiles(fileList);
    } catch (err: any) {
      message.error(`加载受控词汇失败: ${err?.message || err}`);
    }
  }, [moduleKey, nodeId]);

  useEffect(() => {
    loadStudies();
    loadVocabularies();
  }, [loadStudies, loadVocabularies]);

  const handleDelete = async (id: string) => {
    try {
      await studyApi.remove(id);
      message.success('已删除');
      await loadStudies();
    } catch (err: any) {
      message.error(`删除失败: ${err?.message || err}`);
    }
  };

  const handleRegenerate = async (id: string) => {
    try {
      await studyApi.regenerateXml(id);
      message.success('STF XML 已重新生成');
      await loadStudies();
    } catch (err: any) {
      message.error(`重新生成失败: ${err?.message || err}`);
    }
  };

  const openCreate = () => {
    setEditingStudy(null);
    setEditorOpen(true);
  };

  const openEdit = (study: Study) => {
    setEditingStudy(study);
    setEditorOpen(true);
  };

  return (
    <div style={{ padding: '12px 16px' }}>
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          研究标签文件 (STF) — 章节 {ctdSectionNumber}
        </Text>
        <Space size="small">
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
          >
            新建研究
          </Button>
          <Button
            size="small"
            icon={<ImportOutlined />}
            onClick={() => setImportOpen(true)}
          >
            导入 STF
          </Button>
        </Space>
      </Space>

      {loading ? (
        <Spin />
      ) : studies.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无研究。点击 “新建研究” 创建第一份。"
        />
      ) : (
        <List
          size="small"
          dataSource={studies}
          renderItem={(study) => (
            <List.Item
              actions={[
                <Button
                  key="regen"
                  size="small"
                  type="link"
                  icon={<ReloadOutlined />}
                  onClick={() => handleRegenerate(study.id)}
                  title="重新生成 STF XML"
                />,
                <Button
                  key="edit"
                  size="small"
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(study)}
                />,
                <Popconfirm
                  key="delete"
                  title={`删除研究 ${study.studyId}？`}
                  onConfirm={() => handleDelete(study.id)}
                >
                  <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                avatar={<ExperimentOutlined style={{ fontSize: 18, color: '#1890ff' }} />}
                title={
                  <Space size="small">
                    <Text strong>{study.studyId}</Text>
                    <Tag color="blue">{study.operation.toLowerCase()}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {study.documents.length} 份文件
                    </Text>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={2}>
                    <Text style={{ fontSize: 12 }}>{study.title}</Text>
                    <Space size={4} wrap>
                      {study.categories.map((c) => (
                        <Tag key={c.id} style={{ fontSize: 11 }}>
                          {c.name}: {c.value}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}

      <StudyEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        nodeId={nodeId}
        ctdSectionNumber={ctdSectionNumber}
        editing={editingStudy}
        allCategories={allCategories}
        fileTags={fileTags}
        files={files}
        defaultStfCategories={defaultStfCategories}
        onSaved={async () => {
          setEditorOpen(false);
          await loadStudies();
        }}
      />

      <StudyImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        nodeId={nodeId}
        onImported={async () => {
          setImportOpen(false);
          await loadStudies();
        }}
      />
    </div>
  );
};

// =====================================================================
// Inline editor modal (basic + advanced sections per Plan 12 §4.1)
// =====================================================================

interface StudyEditorModalProps {
  open: boolean;
  onClose: () => void;
  nodeId: string;
  ctdSectionNumber: string;
  editing: Study | null;
  allCategories: StfCategoryGroup[];
  fileTags: StfFileTag[];
  files: FileAttachment[];
  defaultStfCategories?: Array<{ name: string; required?: boolean }>;
  onSaved: () => void;
}

interface CategoryRow {
  name: string;
  value: string;
  required: boolean;
}

interface DocumentRow {
  fileAttachmentId: string;
  fileTag: string;
}

const StudyEditorModal: React.FC<StudyEditorModalProps> = ({
  open,
  onClose,
  nodeId,
  ctdSectionNumber,
  editing,
  allCategories,
  fileTags,
  files,
  defaultStfCategories,
  onSaved,
}) => {
  const [studyId, setStudyId] = useState('');
  const [title, setTitle] = useState('');
  const [operation, setOperation] = useState<StudyOperation>('NEW');

  // Two buckets for categories: preset (from defaultStfCategories) + extra
  const [presetCats, setPresetCats] = useState<CategoryRow[]>([]);
  const [extraCats, setExtraCats] = useState<CategoryRow[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [saving, setSaving] = useState(false);

  // Initialize / reset whenever the modal opens or the editing target changes
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStudyId(editing.studyId);
      setTitle(editing.title);
      setOperation(editing.operation);

      const editingByName = new Map(editing.categories.map((c) => [c.name, c.value]));
      const presetNames = new Set((defaultStfCategories ?? []).map((d) => d.name));
      const preset: CategoryRow[] = (defaultStfCategories ?? []).map((d) => ({
        name: d.name,
        value: editingByName.get(d.name) ?? '',
        required: !!d.required,
      }));
      const extra: CategoryRow[] = editing.categories
        .filter((c) => !presetNames.has(c.name))
        .map((c) => ({ name: c.name, value: c.value, required: false }));
      setPresetCats(preset);
      setExtraCats(extra);

      setDocs(
        editing.documents.map((d) => ({
          fileAttachmentId: d.fileAttachmentId,
          fileTag: d.fileTag,
        })),
      );
    } else {
      setStudyId('');
      setTitle('');
      setOperation('NEW');
      setPresetCats(
        (defaultStfCategories ?? []).map((d) => ({
          name: d.name,
          value: '',
          required: !!d.required,
        })),
      );
      setExtraCats([]);
      setDocs([]);
    }
  }, [open, editing, defaultStfCategories]);

  const allCategoryNames = allCategories.map((c) => c.name);
  const presetNamesSet = new Set(presetCats.map((c) => c.name));
  const availableExtraCategoryNames = allCategoryNames.filter(
    (n) => !presetNamesSet.has(n),
  );

  const valuesForCategory = (name: string) => {
    const group = allCategories.find((c) => c.name === name);
    return group?.values ?? [];
  };

  const handleSave = async () => {
    if (!studyId.trim()) {
      message.error('研究编号不能为空');
      return;
    }
    if (!title.trim()) {
      message.error('研究标题不能为空');
      return;
    }
    // Check required preset categories
    for (const c of presetCats) {
      if (c.required && !c.value) {
        message.error(`类别 "${c.name}" 是必填项`);
        return;
      }
    }

    const allCats = [...presetCats, ...extraCats]
      .filter((c) => c.value)
      .map((c) => ({ name: c.name, value: c.value }));

    const dto: CreateStudyDto = {
      studyId: studyId.trim(),
      title: title.trim(),
      operation,
      categories: allCats,
      documents: docs.filter((d) => d.fileAttachmentId && d.fileTag),
    };

    setSaving(true);
    try {
      if (editing) {
        await studyApi.update(editing.id, dto);
        message.success('已保存');
      } else {
        await studyApi.create(nodeId, dto);
        message.success('已创建');
      }
      onSaved();
    } catch (err: any) {
      message.error(`保存失败: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      title={editing ? `编辑研究 — ${editing.studyId}` : '新建研究'}
      width={720}
      confirmLoading={saving}
      destroyOnClose
    >
      <Form layout="vertical" size="small">
        <Form.Item label="研究编号" required>
          <Input
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
            placeholder="例: TOX-2024-001"
            disabled={!!editing}
          />
        </Form.Item>
        <Form.Item label="研究标题" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="完整的研究报告标题"
          />
        </Form.Item>
        <Form.Item label="生命周期操作">
          <Select
            value={operation}
            onChange={setOperation}
            options={operationOptions}
            style={{ width: 200 }}
          />
        </Form.Item>

        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="基础维度"
          description={
            presetCats.length > 0
              ? `章节 ${ctdSectionNumber} 默认包含以下 ${presetCats.length} 个 STF 类别。请填写对应取值。`
              : `章节 ${ctdSectionNumber} 没有预设的 STF 类别。请通过下方 “高级 — 添加更多类别” 自行添加。`
          }
        />

        {presetCats.map((cat, idx) => (
          <Form.Item
            key={cat.name}
            label={
              <Space size={4}>
                <Text>{cat.name}</Text>
                {cat.required && <Text type="danger">*</Text>}
              </Space>
            }
          >
            <Select
              value={cat.value || undefined}
              onChange={(v) => {
                const next = [...presetCats];
                next[idx] = { ...cat, value: v };
                setPresetCats(next);
              }}
              options={valuesForCategory(cat.name).map((v) => ({
                label: `${v.value} (${v.realm})`,
                value: v.value,
              }))}
              placeholder={`选择 ${cat.name}`}
              allowClear
              showSearch
            />
          </Form.Item>
        ))}

        <Collapse
          size="small"
          items={[
            {
              key: 'advanced',
              label: '高级 — 添加更多类别',
              children: (
                <>
                  {extraCats.map((cat, idx) => (
                    <Space
                      key={idx}
                      style={{ marginBottom: 8, display: 'flex' }}
                      align="baseline"
                    >
                      <Select
                        value={cat.name}
                        onChange={(name) => {
                          const next = [...extraCats];
                          next[idx] = { name, value: '', required: false };
                          setExtraCats(next);
                        }}
                        options={availableExtraCategoryNames.map((n) => ({
                          label: n,
                          value: n,
                        }))}
                        style={{ width: 200 }}
                        placeholder="类别名"
                      />
                      <Select
                        value={cat.value || undefined}
                        onChange={(v) => {
                          const next = [...extraCats];
                          next[idx] = { ...cat, value: v };
                          setExtraCats(next);
                        }}
                        options={valuesForCategory(cat.name).map((v) => ({
                          label: `${v.value} (${v.realm})`,
                          value: v.value,
                        }))}
                        style={{ width: 200 }}
                        placeholder="取值"
                        allowClear
                      />
                      <Button
                        size="small"
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() =>
                          setExtraCats(extraCats.filter((_, i) => i !== idx))
                        }
                      />
                    </Space>
                  ))}
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      setExtraCats([
                        ...extraCats,
                        { name: availableExtraCategoryNames[0] || '', value: '', required: false },
                      ])
                    }
                    disabled={availableExtraCategoryNames.length === 0}
                  >
                    添加类别
                  </Button>
                </>
              ),
            },
          ]}
          style={{ marginBottom: 16 }}
        />

        <Form.Item label="关联文件 (Documents)">
          {docs.map((doc, idx) => (
            <Space
              key={idx}
              style={{ marginBottom: 8, display: 'flex' }}
              align="baseline"
            >
              <Select
                value={doc.fileAttachmentId || undefined}
                onChange={(v) => {
                  const next = [...docs];
                  next[idx] = { ...doc, fileAttachmentId: v };
                  setDocs(next);
                }}
                options={files.map((f) => ({
                  label: f.originalName,
                  value: f.id,
                }))}
                style={{ width: 280 }}
                placeholder="选择已上传的文件"
                showSearch
                optionFilterProp="label"
              />
              <Select
                value={doc.fileTag || undefined}
                onChange={(v) => {
                  const next = [...docs];
                  next[idx] = { ...doc, fileTag: v };
                  setDocs(next);
                }}
                options={fileTags.map((t) => ({
                  label: `${t.value} (${t.realm})`,
                  value: t.value,
                }))}
                style={{ width: 240 }}
                placeholder="file-tag"
                showSearch
                optionFilterProp="label"
              />
              <Button
                size="small"
                type="link"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDocs(docs.filter((_, i) => i !== idx))}
              />
            </Space>
          ))}
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => setDocs([...docs, { fileAttachmentId: '', fileTag: '' }])}
          >
            添加文件
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StudyMetadataPanel;
