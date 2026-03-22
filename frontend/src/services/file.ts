import api from './api';
import axios from 'axios';

export interface FileAttachment {
  id: string;
  sequenceNodeId: string;
  originalName: string;
  storedName: string;
  storagePath: string;
  ectdRelativePath: string;
  fileType: string;
  fileSize: string; // BigInt serialized as string
  md5Checksum: string;
  xmlLang: string;
  isReference: boolean;
  referenceFileId: string | null;
  uploadedBy: string | null;
  createdAt: string;
  pdfAnalysis?: PdfAnalysis;
}

export interface PdfAnalysis {
  id: string;
  pdfVersion: string;
  pageCount: number;
  hasBookmarks: boolean;
  bookmarkZoomInherit: boolean;
  isEncrypted: boolean;
  hasJavascript: boolean;
  hasExternalLinks: boolean;
  hasAttachments: boolean;
  hasMultimedia: boolean;
  isTextSearchable: boolean;
  fontsEmbedded: boolean;
  hasESeal: boolean;
  complianceStatus: 'PASS' | 'WARNING' | 'ERROR';
  complianceDetails: {
    errors: Array<{ ruleId: string; severity: string; message: string; detail?: string }>;
    warnings: Array<{ ruleId: string; severity: string; message: string; detail?: string }>;
  };
}

export interface ReferenceableFile extends FileAttachment {
  sectionNumber: string;
  sectionTitle: string;
  sequenceNumber: string;
}

export const fileApi = {
  /** Upload a single file to a node */
  upload: async (nodeId: string, file: File, onProgress?: (percent: number) => void): Promise<FileAttachment> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('accessToken');
    const res = await axios.post(`/api/v1/nodes/${nodeId}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
    return res.data?.data !== undefined ? res.data.data : res.data;
  },

  /** List files for a node */
  list: (nodeId: string): Promise<FileAttachment[]> =>
    api.get(`/nodes/${nodeId}/files`) as any,

  /** Get file detail */
  detail: (nodeId: string, fileId: string): Promise<FileAttachment> =>
    api.get(`/nodes/${nodeId}/files/${fileId}`) as any,

  /** Delete a file */
  delete: (nodeId: string, fileId: string): Promise<void> =>
    api.delete(`/nodes/${nodeId}/files/${fileId}`) as any,

  /** Get download URL */
  download: (nodeId: string, fileId: string): Promise<{ url: string; originalName: string }> =>
    api.get(`/nodes/${nodeId}/files/${fileId}/download`) as any,

  /** Get preview URL */
  preview: (nodeId: string, fileId: string): Promise<{ url: string }> =>
    api.get(`/nodes/${nodeId}/files/${fileId}/preview`) as any,

  /** Create a file reference */
  createReference: (nodeId: string, sourceFileId: string): Promise<FileAttachment> =>
    api.post(`/nodes/${nodeId}/files/reference`, { sourceFileId }) as any,

  /** List files available for reference */
  listReferenceable: (nodeId: string): Promise<ReferenceableFile[]> =>
    api.get(`/nodes/${nodeId}/files/referenceable`) as any,

  /** Upload editor image */
  uploadEditorImage: async (seqId: string, file: File): Promise<{ url: string }> => {
    const formData = new FormData();
    formData.append('image', file);

    const token = localStorage.getItem('accessToken');
    const res = await axios.post(`/api/v1/sequences/${seqId}/editor/upload-image`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
    });
    return res.data?.data !== undefined ? res.data.data : res.data;
  },
};
