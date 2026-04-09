import api from './api';

export type StudyOperation = 'NEW' | 'REPLACE' | 'APPEND' | 'DELETE';

export interface StudyCategoryDto {
  name: string;
  value: string;
  infoType?: string;
  sortOrder?: number;
}

export interface StudyDocumentDto {
  fileAttachmentId: string;
  fileTag: string;
  fileTagInfoType?: string;
  sortOrder?: number;
}

export interface CreateStudyDto {
  studyId: string;
  title: string;
  operation?: StudyOperation;
  modifiedFromId?: string;
  categories: StudyCategoryDto[];
  documents: StudyDocumentDto[];
}

export type UpdateStudyDto = Partial<CreateStudyDto>;

export interface StudyCategory {
  id: string;
  studyId: string;
  name: string;
  value: string;
  infoType: string;
  sortOrder: number;
}

export interface StudyDocument {
  id: string;
  studyId: string;
  fileAttachmentId: string;
  fileTag: string;
  fileTagInfoType: string;
  sortOrder: number;
  fileAttachment?: {
    id: string;
    originalName: string;
    ectdRelativePath: string;
    md5Checksum: string;
    fileSize: number;
  };
}

export interface Study {
  id: string;
  sequenceId: string;
  sequenceNodeId: string;
  ctdSectionNumber: string;
  studyId: string;
  title: string;
  operation: StudyOperation;
  modifiedFromId: string | null;
  stfFilePath: string | null;
  stfChecksum: string | null;
  stfXmlContent: string | null;
  createdAt: string;
  updatedAt: string;
  categories: StudyCategory[];
  documents: StudyDocument[];
}

export type ImportConflictMode = 'reject' | 'overwrite' | 'merge';

export interface ImportStfXmlResult {
  studyId: string;
  created: boolean;
  warnings: string[];
}

export const studyApi = {
  listBySequence: (seqId: string) =>
    api.get<any, Study[]>(`/sequences/${seqId}/studies`),

  listByNode: (nodeId: string) =>
    api.get<any, Study[]>(`/sequence-nodes/${nodeId}/studies`),

  getById: (id: string) =>
    api.get<any, Study>(`/studies/${id}`),

  create: (nodeId: string, dto: CreateStudyDto) =>
    api.post<any, Study>(`/sequence-nodes/${nodeId}/studies`, dto),

  update: (id: string, dto: UpdateStudyDto) =>
    api.patch<any, Study>(`/studies/${id}`, dto),

  remove: (id: string) =>
    api.delete<any, { id: string; deleted: boolean }>(`/studies/${id}`),

  regenerateXml: (id: string) =>
    api.post<any, Study>(`/studies/${id}/regenerate-xml`),

  // Plan 12 §3.6 — import endpoints (handled by StudyTaggingFileImportService)
  importStfXml: (
    nodeId: string,
    body: { xml: string; onConflict?: ImportConflictMode },
  ) =>
    api.post<any, ImportStfXmlResult>(
      `/sequence-nodes/${nodeId}/studies/import-xml`,
      body,
    ),

  importStfBundle: (
    nodeId: string,
    body: {
      xml: string;
      files: Array<{ originalName: string; base64: string; md5?: string }>;
      onConflict?: ImportConflictMode;
    },
  ) =>
    api.post<any, ImportStfXmlResult>(
      `/sequence-nodes/${nodeId}/studies/import-bundle`,
      body,
    ),
};
