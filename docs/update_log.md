# 进度更新日志

> 每次代码修改必须在此记录。格式: 日期 | 修改内容 | 影响模块 | 关联计划

## 更新记录

| 日期 | 修改内容 | 影响模块 | 关联计划 |
|------|---------|---------|---------|
| 2026-03-20 | 项目初始化：创建文档结构、CLAUDE.md、架构文档、技术 Skills、执行计划 | 全部 | 准备阶段 |
| 2026-03-20 | 重写全部 8 份执行计划（plan_1~plan_8），从偏技术实现转向以 eCTD 法规合规为核心。深度整合: 受控词汇体系、信封元素不可变性、生命周期状态机、撤回序列4步流程、骨架属性更新规则、STF生成、内容完整性规则(4.3.x)、V1.1升级的8项PDF错误级别规则、电子签章要求、文件命名/路径规范、扩展节点限制等。同步更新 CLAUDE.md 核心业务逻辑和术语表。 | 全部计划文档、CLAUDE.md | 准备阶段 |
| 2026-03-20 | 全面更新架构文档，与重写后的执行计划对齐: (1) database_design.md — 新增 regulatory_activity/controlled_vocabulary/cv_dependency/ctd_completeness_rule/file_pdf_analysis/study_tagging_file/comment/activity_log 等表，受控词汇改用 VARCHAR 代码; (2) backend_architecture.md — 新增 controlled-vocabulary/regulatory-activity 模块，信封元素管理表，生命周期状态机，错误码扩至 1001-1018; (3) api_design.md — 新增注册行为/受控词汇/STF/编辑锁/审批/评论/日志 API; (4) frontend_architecture.md — CTD 树增加 STF/电子签章/合规状态图标，编辑器增加中文字体规范/语言标记，新增 useCVStore; (5) tech_stack.md — 后端目录新增 regulatory-activity/controlled-vocabulary/completeness/pdf-compliance/envelope/package-assembler/file-name-normalizer; (6) CLAUDE.md — 计划描述更新为重写后的标题 | 全部架构文档、CLAUDE.md、tech_stack.md | 准备阶段 |
