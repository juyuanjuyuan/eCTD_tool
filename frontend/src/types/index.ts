// ==================== User ====================
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface AuthResponse {
  user: Pick<User, 'id' | 'email' | 'name' | 'role'>;
  accessToken: string;
  refreshToken: string;
}

// ==================== Project ====================
export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdBy: string;
  creator: { id: string; name: string };
  _count: { applications: number; members: number };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: 'OWNER' | 'MEMBER' | 'VIEWER';
  user: { id: string; name: string; email: string };
}

// ==================== Application ====================
export interface Application {
  id: string;
  projectId: string;
  applicationNumber: string;
  applicationTypeCode: string;
  applicationTypeVersion: string;
  productTypeCode: string;
  productTypeVersion: string;
  productNumber: string;
  _count?: { regulatoryActivities: number };
  createdAt: string;
}

// ==================== Regulatory Activity ====================
export interface RegulatoryActivity {
  id: string;
  applicationId: string;
  regulatoryActivityTypeCode: string;
  regulatoryActivityTypeVersion: string;
  relatedSequence: string;
  _count?: { sequences: number };
  sequences?: Sequence[];
  createdAt: string;
}

// ==================== Sequence ====================
export interface Sequence {
  id: string;
  regulatoryActivityId: string;
  sequenceNumber: string;
  sequenceTypeCode: string;
  sequenceTypeVersion: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  status: 'DRAFT' | 'EDITING' | 'VALIDATING' | 'EXPORTED' | 'SUBMITTED';
  createdAt: string;
  updatedAt: string;
}

// ==================== Controlled Vocabulary ====================
export interface ControlledVocabulary {
  id: string;
  vocabularyName: string;
  code: string;
  version: string;
  validFrom: string;
  validTo?: string;
  descriptionZh: string;
  descriptionEn: string;
}

// ==================== CTD Template ====================
export interface CtdTemplateNode {
  id: string;
  parentId: string | null;
  module: number;
  elementName: string;
  ctdSectionNumber: string;
  titleZh: string;
  titleEn: string;
  nodeType: 'MODULE' | 'SECTION' | 'LEAF' | 'EXTENSION_POINT';
  isLeaf: boolean;
  requiresStf: boolean;
  requiresESeal: boolean;
  allowsExtension: boolean;
  sortOrder: number;
  children?: CtdTemplateNode[];
  isRequired?: boolean;
  isForbidden?: boolean;
}

export interface SequenceNode {
  id: string;
  sequenceId: string;
  templateNodeId: string;
  parentId: string | null;
  elementName: string;
  ctdSectionNumber: string;
  title: string;
  operation: 'NEW' | 'REPLACE' | 'APPEND' | 'DELETE' | null;
  status: 'EMPTY' | 'EDITING' | 'COMPLETED';
  isRequired: boolean;
  isLeaf: boolean;
  sortOrder: number;
  substance?: string;
  manufacturer?: string;
  productName?: string;
  dosageForm?: string;
  indication?: string;
  children?: SequenceNode[];
}

export interface CompletenessResult {
  totalSections: number;
  requiredSections: number;
  completedRequired: number;
  forbiddenViolations: Array<{ elementName: string; section: string; title: string }>;
  missingRequired: Array<{
    elementName: string;
    section: string;
    title: string;
    severity: string;
  }>;
  moduleStats: Record<string, { total: number; required: number; completed: number }>;
}

export interface ExtensionOption {
  type: string;
  titleZh: string;
  titleEn: string;
}

// ==================== Document ====================
export interface Document {
  id: string | null;
  nodeId: string;
  contentJson: any;
  contentHtml: string;
  contentText: string;
  wordCount: number;
  version: number;
  xmlLang: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  version: number;
  wordCount: number;
  xmlLang: string;
  createdBy: string | null;
  createdAt: string;
  contentJson?: any;
  contentHtml?: string;
}

// ==================== API ====================
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
