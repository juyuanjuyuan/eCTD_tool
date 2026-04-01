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

/** Files larger than this threshold will use chunked upload (10MB) */
const CHUNK_UPLOAD_THRESHOLD = 10 * 1024 * 1024;
/** Size of each chunk (5MB) */
const CHUNK_SIZE = 5 * 1024 * 1024;
/** Timeout per chunk request (5 minutes) */
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Upload a large file in chunks.
 * Each chunk is sent as a separate request. Progress is tracked across all chunks.
 */
async function chunkedUpload(
  nodeId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<FileAttachment> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const token = localStorage.getItem('accessToken');

  let lastResult: any = null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('uploadId', uploadId);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));
    formData.append('fileName', file.name);

    const res = await axios.post(
      `/api/v1/nodes/${nodeId}/files/chunk`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
        timeout: CHUNK_TIMEOUT_MS,
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            // Progress = completed chunks + current chunk progress
            const chunkProgress = e.loaded / e.total;
            const overall = ((i + chunkProgress) / totalChunks) * 100;
            onProgress(Math.round(overall));
          }
        },
      },
    );

    lastResult = res.data?.data !== undefined ? res.data.data : res.data;
  }

  return lastResult;
}

export const fileApi = {
  /**
   * Upload a file to a node.
   * Automatically uses chunked upload for files > 10MB.
   */
  upload: async (nodeId: string, file: File, onProgress?: (percent: number) => void): Promise<FileAttachment> => {
    // Use chunked upload for large files
    if (file.size > CHUNK_UPLOAD_THRESHOLD) {
      return chunkedUpload(nodeId, file, onProgress);
    }

    // Small files: direct single-request upload
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('accessToken');
    const res = await axios.post(`/api/v1/nodes/${nodeId}/files/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        Authorization: `Bearer ${token}`,
      },
      timeout: CHUNK_TIMEOUT_MS,
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
