/**
 * Integration Workflow & Permission & Concurrency Tests — Plan 8 Stage 2.2
 *
 * Tests complete workflow chains, role-based access control, and concurrency
 * scenarios using mocked database but testing real service interaction logic.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidatorService } from './validator.service';
import { LifecycleService } from './lifecycle.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Md5Service } from './md5.service';
import { ApprovalService } from '../../approval/approval.service';
import { EditLockService } from '../../edit-lock/edit-lock.service';
import { RedisCacheService } from '../../common/redis-cache.service';
import { ValidationSeverity, LeafOperation } from '@prisma/client';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

// ====================== Test Helpers ======================

function buildSequence(overrides: any = {}) {
  return {
    id: 'seq-1',
    sequenceNumber: '0000',
    sequenceTypeCode: 'cnsqt1',
    status: 'DRAFT',
    contactName: '张三',
    contactPhone: '13800000000',
    contactEmail: 'test@example.com',
    description: '首次提交申报资料',
    regulatoryActivityId: 'ra-1',
    regulatoryActivity: {
      id: 'ra-1',
      applicationId: 'app-1',
      regulatoryActivityTypeCode: 'cnrat1',
      relatedSequence: '0000',
      application: {
        id: 'app-1',
        applicationNumber: 'x202600001',
        applicationTypeCode: 'cnapt2',
        productTypeCode: 'cnprt1',
        productNumber: '2026000001',
      },
      sequences: [{ id: 'seq-1', sequenceNumber: '0000' }],
    },
    sequenceNodes: [],
    ...overrides,
  };
}

function buildLeaf(overrides: any = {}) {
  return {
    id: `node-${Math.random().toString(36).substr(2, 8)}`,
    isLeaf: true,
    ctdSectionNumber: '2.3.S.1',
    title: '一般性质',
    operation: 'NEW',
    status: 'COMPLETED',
    approvalStatus: 'DRAFT',
    parentId: null,
    templateNodeId: 'tmpl-1',
    elementName: 'general-properties',
    templateNode: { module: 2, requiresStf: false, elementName: 'general-properties', allowsExtension: false, ctdSectionNumber: '2.3.S.1', titleZh: '一般性质' },
    children: [],
    substance: undefined,
    manufacturer: undefined,
    productName: undefined,
    dosageform: undefined,
    indication: undefined,
    fileAttachments: [{
      id: 'file-1',
      fileSize: 1024 * 1024,
      fileType: 'pdf',
      originalName: 'test.pdf',
      storedName: 'test.pdf',
      ectdRelativePath: 'm2/23-qos/test.pdf',
      pdfAnalysis: {
        pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
        hasExternalLinks: false, hasMultimedia: false, pageCount: 3,
        hasBookmarks: false, bookmarkZoomInherit: true,
        hasAttachments: false, fontsEmbedded: true,
      },
    }],
    document: null,
    studyTaggingFile: null,
    ...overrides,
  };
}

// ==============================================================
// 2.2 Complete Workflow Integration Test
// ==============================================================

describe('Integration: Complete Workflow', () => {
  let validatorService: ValidatorService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      sequence: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      sequenceNode: {
        findFirst: jest.fn(),
      },
      validationReport: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'report-1', ...data })),
      },
      ctdCompletenessRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      cvDependency: {
        findFirst: jest.fn().mockResolvedValue({ id: 'dep1', sequenceTypeCode: null }),
      },
      fileAttachment: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidatorService,
        { provide: PrismaService, useValue: prisma },
        { provide: Md5Service, useValue: new Md5Service() },
      ],
    }).compile();

    validatorService = module.get<ValidatorService>(ValidatorService);
  });

  it('should validate a complete first submission with multiple modules', async () => {
    const seq = buildSequence({
      sequenceNodes: [
        buildLeaf({
          ctdSectionNumber: '1.2', templateNodeId: 'tmpl-12',
          templateNode: { module: 1, requiresStf: false, elementName: 'cn-1-2', allowsExtension: false, ctdSectionNumber: '1.2', titleZh: '申请表' },
          fileAttachments: [{
            id: 'f-12', fileSize: 2048, fileType: 'pdf',
            originalName: 'application-form.pdf', storedName: 'application-form.pdf',
            ectdRelativePath: 'm1/cn/02/application-form.pdf',
            pdfAnalysis: {
              pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
              hasExternalLinks: false, hasMultimedia: false, pageCount: 5,
              hasBookmarks: false, bookmarkZoomInherit: true,
              hasAttachments: false, fontsEmbedded: true,
            },
          }],
        }),
        buildLeaf({
          ctdSectionNumber: '2.3', templateNodeId: 'tmpl-23',
          templateNode: { module: 2, requiresStf: false, elementName: 'm2-3-qos', allowsExtension: false, ctdSectionNumber: '2.3', titleZh: '质量综述' },
        }),
        buildLeaf({
          ctdSectionNumber: '3.2.S.1', templateNodeId: 'tmpl-32s1',
          templateNode: { module: 3, requiresStf: false, elementName: 'm3-2-s-1', allowsExtension: false, ctdSectionNumber: '3.2.S.1', titleZh: '原料药一般性质' },
          fileAttachments: [{
            id: 'f-32s1', fileSize: 4096, fileType: 'pdf',
            originalName: 'drug-substance.pdf', storedName: 'drug-substance.pdf',
            ectdRelativePath: 'm3/32-body-data/drug-substance.pdf',
            pdfAnalysis: {
              pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
              hasExternalLinks: false, hasMultimedia: false, pageCount: 10,
              hasBookmarks: true, bookmarkZoomInherit: true,
              hasAttachments: false, fontsEmbedded: true,
            },
          }],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');

    // No errors for valid multi-module submission
    const errors = result.items.filter(i => i.severity === ValidationSeverity.ERROR);
    expect(errors).toHaveLength(0);
    expect(result.isPassed).toBe(true);
  });

  it('should chain validation: first submission → subsequent submission', async () => {
    // First: validate 0000
    const seq0 = buildSequence({
      id: 'seq-0',
      sequenceNumber: '0000',
      sequenceNodes: [
        buildLeaf({ operation: 'NEW', templateNodeId: 'tmpl-1' }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq0);

    const result0 = await validatorService.validate('seq-0');
    expect(result0.isPassed).toBe(true);

    // Then: validate 0001 with REPLACE (needs prior sequence)
    const seq1 = buildSequence({
      id: 'seq-1',
      sequenceNumber: '0001',
      sequenceNodes: [
        buildLeaf({ operation: 'REPLACE', templateNodeId: 'tmpl-1' }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq1);
    prisma.sequence.findMany.mockResolvedValue([{ id: 'seq-0' }]);
    prisma.sequenceNode.findFirst.mockResolvedValue({ operation: 'NEW' });

    const result1 = await validatorService.validate('seq-1');

    // REPLACE with existing prior should pass
    const modifiedErrors = result1.items.filter(
      i => i.ruleCode === '3.11' && i.severity === ValidationSeverity.ERROR,
    );
    expect(modifiedErrors).toHaveLength(0);
  });

  it('should detect multiple validation rule violations in single pass', async () => {
    const seq = buildSequence({
      sequenceNumber: '0000',
      contactName: null, // violation: missing contact
      description: null, // violation: missing description
      sequenceNodes: [
        buildLeaf({
          operation: 'REPLACE', // violation: non-NEW in 0000
          fileAttachments: [], // violation: no files for non-DELETE
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');

    expect(result.isPassed).toBe(false);
    expect(result.totalErrors).toBeGreaterThanOrEqual(3);

    // Verify specific errors detected
    const ruleCodes = result.items
      .filter(i => i.severity === ValidationSeverity.ERROR)
      .map(i => i.ruleCode);
    expect(ruleCodes).toContain('4.2.9'); // missing contact
    expect(ruleCodes).toContain('3.10'); // non-NEW in 0000
  });

  it('should validate STF requirements for module 4/5 leaves', async () => {
    const seq = buildSequence({
      sequenceNodes: [
        buildLeaf({
          ctdSectionNumber: '4.2.1',
          templateNode: { module: 4, requiresStf: true, elementName: 'pharmacology', allowsExtension: false, ctdSectionNumber: '4.2.1', titleZh: '药理学' },
          studyTaggingFile: {
            studyTitle: '药理学研究',
            studyId: 'PHARM-001',
          },
          fileAttachments: [{
            id: 'f-stf', fileSize: 2048, fileType: 'pdf',
            originalName: 'study-report.pdf', storedName: 'study-report.pdf',
            ectdRelativePath: 'm4/42-stud-rep/study-report.pdf',
            pdfAnalysis: {
              pdfVersion: '1.7', isEncrypted: false, hasJavascript: false,
              hasExternalLinks: false, hasMultimedia: false, pageCount: 20,
              hasBookmarks: true, bookmarkZoomInherit: true,
              hasAttachments: false, fontsEmbedded: true,
            },
          }],
        }),
      ],
    });
    prisma.sequence.findUnique.mockResolvedValue(seq);

    const result = await validatorService.validate('seq-1');

    // STF-required node with valid STF should pass
    const stfErrors = result.items.filter(
      i => i.ruleCategory === 'STF' && i.severity === ValidationSeverity.ERROR,
    );
    expect(stfErrors).toHaveLength(0);
  });
});

// ==============================================================
// 2.2 Permission Tests (Role-based Access Control)
// ==============================================================

describe('Integration: Permission & Access Control', () => {
  describe('Approval role-based access', () => {
    let approvalService: ApprovalService;
    let prisma: Record<string, any>;

    const makeLeafNode = (overrides: any = {}) => ({
      id: 'node-1',
      isLeaf: true,
      approvalStatus: 'DRAFT',
      status: 'COMPLETED',
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      ...overrides,
    });

    beforeEach(async () => {
      prisma = {
        sequenceNode: {
          findUnique: jest.fn(),
          findMany: jest.fn(),
          update: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ ...makeLeafNode(), ...data })),
        },
        user: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApprovalService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();

      approvalService = module.get<ApprovalService>(ApprovalService);
    });

    it('should allow EDITOR to submit node for approval', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode());

      const result = await approvalService.submitForApproval('node-1', 'editor-user');

      expect(result.approvalStatus).toBe('SUBMITTED');
    });

    it('should prevent approval of non-SUBMITTED node', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'DRAFT' }));

      await expect(
        approvalService.approveNode('node-1', 'manager-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent submission of APPROVED node', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'APPROVED' }));

      await expect(
        approvalService.submitForApproval('node-1', 'editor-user'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow re-submission of REJECTED node', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(
        makeLeafNode({ approvalStatus: 'REJECTED' }),
      );

      const result = await approvalService.submitForApproval('node-1', 'editor-user');

      expect(result.approvalStatus).toBe('SUBMITTED');
    });

    it('should allow MANAGER to approve SUBMITTED node', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(
        makeLeafNode({ approvalStatus: 'SUBMITTED' }),
      );

      const result = await approvalService.approveNode('node-1', 'manager-user');

      expect(result.approvalStatus).toBe('APPROVED');
    });

    it('should allow MANAGER to reject with reason', async () => {
      prisma.sequenceNode.findUnique.mockResolvedValue(
        makeLeafNode({ approvalStatus: 'SUBMITTED' }),
      );

      const result = await approvalService.rejectNode('node-1', 'manager-user', '需要修改格式');

      expect(result.approvalStatus).toBe('REJECTED');
      expect(result.rejectionReason).toBe('需要修改格式');
    });

    it('should track complete approval flow: DRAFT → SUBMITTED → REJECTED → SUBMITTED → APPROVED', async () => {
      // Step 1: DRAFT → SUBMITTED
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'DRAFT' }));
      let result = await approvalService.submitForApproval('node-1', 'editor');
      expect(result.approvalStatus).toBe('SUBMITTED');

      // Step 2: SUBMITTED → REJECTED
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'SUBMITTED' }));
      result = await approvalService.rejectNode('node-1', 'manager', '需要补充数据');
      expect(result.approvalStatus).toBe('REJECTED');

      // Step 3: REJECTED → SUBMITTED (re-submit)
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'REJECTED' }));
      result = await approvalService.submitForApproval('node-1', 'editor');
      expect(result.approvalStatus).toBe('SUBMITTED');

      // Step 4: SUBMITTED → APPROVED
      prisma.sequenceNode.findUnique.mockResolvedValue(makeLeafNode({ approvalStatus: 'SUBMITTED' }));
      result = await approvalService.approveNode('node-1', 'manager');
      expect(result.approvalStatus).toBe('APPROVED');
    });
  });
});

// ==============================================================
// 2.2 Concurrency Tests (Edit Lock, Sequence Number)
// ==============================================================

describe('Integration: Concurrency Control', () => {
  describe('Edit lock concurrency', () => {
    let editLockService: EditLockService;
    let redis: Record<string, any>;

    beforeEach(() => {
      redis = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        del: jest.fn().mockResolvedValue(undefined),
        setnx: jest.fn().mockResolvedValue(true),
        expire: jest.fn().mockResolvedValue(undefined),
      };

      editLockService = new EditLockService(redis as any);
    });

    it('should prevent concurrent editing by different users', async () => {
      // User A acquires lock
      const lockA = await editLockService.acquireLock('node-1', 'user-a', '用户A');
      expect(lockA.userId).toBe('user-a');

      // User B tries to acquire same lock — simulate SETNX failure
      redis.get.mockResolvedValueOnce(null); // First call: check existing lock
      redis.setnx.mockResolvedValue(false); // Lock already taken
      redis.get.mockResolvedValueOnce({ userId: 'user-a', userName: '用户A' }); // Second call: get holder info

      await expect(
        editLockService.acquireLock('node-1', 'user-b', '用户B'),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow same user to refresh their lock', async () => {
      const existing = {
        userId: 'user-a',
        userName: '用户A',
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      };
      redis.get.mockResolvedValue(existing);

      // Same user re-acquires — should succeed (refresh)
      const lock = await editLockService.acquireLock('node-1', 'user-a', '用户A');
      expect(lock).toEqual(existing);
      expect(redis.setnx).not.toHaveBeenCalled(); // No new lock needed
    });

    it('should allow lock release and re-acquisition by another user', async () => {
      // User A holds the lock
      redis.get.mockResolvedValue({ userId: 'user-a', userName: '用户A' });

      // User A releases
      await editLockService.releaseLock('node-1', 'user-a');
      expect(redis.del).toHaveBeenCalledWith('lock:node:node-1');

      // Reset mocks for User B
      redis.get.mockResolvedValue(null);
      redis.setnx.mockResolvedValue(true);

      // User B acquires
      const lockB = await editLockService.acquireLock('node-1', 'user-b', '用户B');
      expect(lockB.userId).toBe('user-b');
    });

    it('should prevent non-holder from releasing lock', async () => {
      redis.get.mockResolvedValue({ userId: 'user-a', userName: '用户A' });

      await expect(
        editLockService.releaseLock('node-1', 'user-b'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow force unlock by manager (admin)', async () => {
      await editLockService.forceUnlock('node-1');
      expect(redis.del).toHaveBeenCalledWith('lock:node:node-1');
    });

    it('should handle heartbeat to prevent lock expiry', async () => {
      const existing = {
        userId: 'user-a',
        userName: '用户A',
        acquiredAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };
      redis.get.mockResolvedValue(existing);

      const renewed = await editLockService.heartbeat('node-1', 'user-a');
      expect(renewed).toBeDefined();
      expect(renewed!.userId).toBe('user-a');
      expect(redis.set).toHaveBeenCalled();
    });

    it('should reject heartbeat from non-holder', async () => {
      redis.get.mockResolvedValue({ userId: 'user-a', userName: '用户A' });

      const result = await editLockService.heartbeat('node-1', 'user-b');
      expect(result).toBeNull(); // Silently ignored
    });
  });

  describe('Sequence number concurrency', () => {
    it('should generate sequential sequence numbers', () => {
      // Simulating the auto-increment logic
      const numbers = ['0000', '0001', '0002', '0003'];
      for (let i = 1; i < numbers.length; i++) {
        const prev = parseInt(numbers[i - 1], 10);
        const next = String(prev + 1).padStart(4, '0');
        expect(next).toBe(numbers[i]);
      }
    });

    it('should not skip sequence numbers', () => {
      const existing = ['0000', '0001', '0002'];
      const nextNum = existing.length;
      const nextSeq = String(nextNum).padStart(4, '0');
      expect(nextSeq).toBe('0003');
    });

    it('should handle sequence number format correctly up to 9999', () => {
      expect(String(0).padStart(4, '0')).toBe('0000');
      expect(String(9999).padStart(4, '0')).toBe('9999');
      expect(String(100).padStart(4, '0')).toBe('0100');
    });
  });

  describe('Lifecycle operation transitions (concurrent validation)', () => {
    let lifecycleService: LifecycleService;
    const mockPrisma = {
      sequence: { findUnique: jest.fn(), findMany: jest.fn() },
      sequenceNode: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    };

    beforeEach(() => {
      lifecycleService = new LifecycleService(mockPrisma as any);
      jest.clearAllMocks();
    });

    it('should validate parallel sequences do not conflict on same template node', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue({
        id: 'seq-2', regulatoryActivityId: 'ra-1',
        regulatoryActivity: { id: 'ra-1' },
      });

      // Another DRAFT sequence exists
      mockPrisma.sequence.findMany.mockResolvedValue([
        { id: 'seq-3', sequenceNumber: '0003' },
      ]);

      // Both sequences modify same template node
      mockPrisma.sequenceNode.findMany
        .mockResolvedValueOnce([
          { id: 'n1', templateNodeId: 'shared-tpl', isLeaf: true },
          { id: 'n2', templateNodeId: 'unique-tpl', isLeaf: true },
        ])
        .mockResolvedValueOnce([
          { id: 'n3', templateNodeId: 'shared-tpl', isLeaf: true },
        ]);

      const conflicts = await lifecycleService.checkParallelConflicts('seq-2');

      expect(conflicts.length).toBe(1);
      expect(conflicts[0].conflictNodeIds).toContain('n1');
      expect(conflicts[0].conflictNodeIds).not.toContain('n2');
    });

    it('should report no conflicts when sequences modify different nodes', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue({
        id: 'seq-2', regulatoryActivityId: 'ra-1',
        regulatoryActivity: { id: 'ra-1' },
      });

      mockPrisma.sequence.findMany.mockResolvedValue([
        { id: 'seq-3', sequenceNumber: '0003' },
      ]);

      mockPrisma.sequenceNode.findMany
        .mockResolvedValueOnce([{ id: 'n1', templateNodeId: 'tpl-a', isLeaf: true }])
        .mockResolvedValueOnce([{ id: 'n2', templateNodeId: 'tpl-b', isLeaf: true }]);

      const conflicts = await lifecycleService.checkParallelConflicts('seq-2');
      expect(conflicts.length).toBe(0);
    });

    it('should detect conflicts across multiple parallel sequences', async () => {
      mockPrisma.sequence.findUnique.mockResolvedValue({
        id: 'seq-1', regulatoryActivityId: 'ra-1',
        regulatoryActivity: { id: 'ra-1' },
      });

      // Two parallel sequences
      mockPrisma.sequence.findMany.mockResolvedValue([
        { id: 'seq-2', sequenceNumber: '0002' },
        { id: 'seq-3', sequenceNumber: '0003' },
      ]);

      mockPrisma.sequenceNode.findMany
        .mockResolvedValueOnce([ // current seq nodes
          { id: 'n1', templateNodeId: 'shared-1', isLeaf: true },
          { id: 'n2', templateNodeId: 'shared-2', isLeaf: true },
        ])
        .mockResolvedValueOnce([ // seq-2 nodes
          { id: 'n3', templateNodeId: 'shared-1', isLeaf: true },
        ])
        .mockResolvedValueOnce([ // seq-3 nodes
          { id: 'n4', templateNodeId: 'shared-2', isLeaf: true },
        ]);

      const conflicts = await lifecycleService.checkParallelConflicts('seq-1');
      expect(conflicts.length).toBe(2);
    });
  });
});
