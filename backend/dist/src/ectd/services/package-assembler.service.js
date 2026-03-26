"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PackageAssemblerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageAssemblerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const cn_regional_xml_service_1 = require("./cn-regional-xml.service");
const index_xml_service_1 = require("./index-xml.service");
const md5_service_1 = require("./md5.service");
const validator_service_1 = require("./validator.service");
const minio_service_1 = require("../../file/minio.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const archiver_1 = __importDefault(require("archiver"));
const stream_1 = require("stream");
const MODULE_FOLDER_MAP = {
    1: 'm1',
    2: 'm2',
    3: 'm3',
    4: 'm4',
    5: 'm5',
};
const MODULE_SUBFOLDERS = {
    '1.0': 'm1/cn/00',
    '1.1': 'm1/cn/01',
    '1.2': 'm1/cn/02',
    '1.3': 'm1/cn/03',
    '1.4': 'm1/cn/04',
    '1.5': 'm1/cn/05',
    '1.6': 'm1/cn/06',
    '1.7': 'm1/cn/07',
    '1.8': 'm1/cn/08',
    '1.9': 'm1/cn/09',
    '1.10': 'm1/cn/10',
    '1.11': 'm1/cn/11',
    '1.12': 'm1/cn/12',
    '2.2': 'm2/22-intro',
    '2.3': 'm2/23-qos',
    '2.4': 'm2/24-nonclin-over',
    '2.5': 'm2/25-clin-over',
    '2.6': 'm2/26-nonclin-sum',
    '2.7': 'm2/27-clin-sum',
    '3.2': 'm3/32-body-data',
    '3.3': 'm3/33-lit-ref',
    '4.2': 'm4/42-stud-rep',
    '4.3': 'm4/43-lit-ref',
    '5.2': 'm5/52-tab-list',
    '5.3': 'm5/53-clin-stud-rep',
    '5.4': 'm5/54-lit-ref',
};
let PackageAssemblerService = PackageAssemblerService_1 = class PackageAssemblerService {
    prisma;
    cnRegionalXml;
    indexXml;
    md5Service;
    validator;
    minioService;
    logger = new common_1.Logger(PackageAssemblerService_1.name);
    utilSourceBase = path.resolve(process.cwd(), '../reference/eCTD技术规范V1.1附件包');
    constructor(prisma, cnRegionalXml, indexXml, md5Service, validator, minioService) {
        this.prisma = prisma;
        this.cnRegionalXml = cnRegionalXml;
        this.indexXml = indexXml;
        this.md5Service = md5Service;
        this.validator = validator;
        this.minioService = minioService;
    }
    async assemblePackage(sequenceId) {
        const requiredNodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId, isRequired: true, isLeaf: true },
            select: { id: true, ctdSectionNumber: true, title: true, approvalStatus: true },
        });
        const unapproved = requiredNodes.filter((n) => n.approvalStatus !== 'APPROVED');
        if (unapproved.length > 0) {
            throw new common_1.BadRequestException({
                message: `${unapproved.length} 个必填章节尚未审批通过，无法生成 eCTD 包`,
                unapprovedSections: unapproved.map((n) => ({
                    section: n.ctdSectionNumber,
                    title: n.title,
                    status: n.approvalStatus,
                })),
            });
        }
        const validationResult = await this.validator.validate(sequenceId);
        if (!validationResult.isPassed) {
            throw new common_1.BadRequestException({
                message: `验证未通过，有 ${validationResult.totalErrors} 个错误需要修复`,
                reportId: validationResult.reportId,
                errors: validationResult.items.filter((i) => i.severity === 'ERROR'),
            });
        }
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: { application: true },
                },
                sequenceNodes: {
                    include: {
                        templateNode: { select: { module: true } },
                        fileAttachments: true,
                        studyTaggingFile: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (!sequence)
            throw new common_1.BadRequestException('序列不存在');
        const appNumber = sequence.regulatoryActivity.application.applicationNumber;
        const seqNumber = sequence.sequenceNumber;
        const basePath = `${appNumber}/${seqNumber}`;
        const cnRegionalContent = await this.cnRegionalXml.generateCnRegionalXml(sequenceId);
        const indexContent = await this.indexXml.generateIndexXml(sequenceId);
        const indexMd5Content = this.md5Service.generateIndexMd5([
            { fileName: 'index.xml', content: indexContent },
            { fileName: 'cn-regional.xml', content: cnRegionalContent },
        ]);
        const buffer = await this.buildZip(basePath, sequence, cnRegionalContent, indexContent, indexMd5Content);
        await this.prisma.sequence.update({
            where: { id: sequenceId },
            data: { status: 'EXPORTED' },
        });
        return {
            buffer,
            fileName: `${appNumber}_${seqNumber}_ectd.zip`,
        };
    }
    async assemblePackageStream(sequenceId) {
        const requiredNodes = await this.prisma.sequenceNode.findMany({
            where: { sequenceId, isRequired: true, isLeaf: true },
            select: { id: true, ctdSectionNumber: true, title: true, approvalStatus: true },
        });
        const unapproved = requiredNodes.filter((n) => n.approvalStatus !== 'APPROVED');
        if (unapproved.length > 0) {
            throw new common_1.BadRequestException({
                message: `${unapproved.length} 个必填章节尚未审批通过，无法生成 eCTD 包`,
                unapprovedSections: unapproved.map((n) => ({
                    section: n.ctdSectionNumber,
                    title: n.title,
                    status: n.approvalStatus,
                })),
            });
        }
        const validationResult = await this.validator.validate(sequenceId);
        if (!validationResult.isPassed) {
            throw new common_1.BadRequestException({
                message: `验证未通过，有 ${validationResult.totalErrors} 个错误需要修复`,
                reportId: validationResult.reportId,
            });
        }
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: { include: { application: true } },
                sequenceNodes: {
                    include: {
                        templateNode: { select: { module: true } },
                        fileAttachments: true,
                        studyTaggingFile: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (!sequence)
            throw new common_1.BadRequestException('序列不存在');
        const appNumber = sequence.regulatoryActivity.application.applicationNumber;
        const seqNumber = sequence.sequenceNumber;
        const basePath = `${appNumber}/${seqNumber}`;
        const cnRegionalContent = await this.cnRegionalXml.generateCnRegionalXml(sequenceId);
        const indexContent = await this.indexXml.generateIndexXml(sequenceId);
        const indexMd5Content = this.md5Service.generateIndexMd5([
            { fileName: 'index.xml', content: indexContent },
            { fileName: 'cn-regional.xml', content: cnRegionalContent },
        ]);
        const passThrough = new stream_1.PassThrough();
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 6 } });
        archive.on('error', (err) => passThrough.destroy(err));
        archive.pipe(passThrough);
        archive.append(indexContent, { name: `${basePath}/index.xml` });
        archive.append(indexMd5Content, { name: `${basePath}/index-md5.txt` });
        archive.append(cnRegionalContent, { name: `${basePath}/m1/cn/cn-regional.xml` });
        this.addUtilFiles(archive, basePath);
        for (const node of sequence.sequenceNodes) {
            if (!node.isLeaf || !node.operation || node.operation === 'DELETE')
                continue;
            const files = node.fileAttachments || [];
            if (files.length === 0)
                continue;
            for (const file of files) {
                if (file.isReference && file.referenceFileId)
                    continue;
                const filePath = `${basePath}/${file.ectdRelativePath}`;
                if (this.minioService && file.storagePath) {
                    try {
                        const fileStream = await this.minioService.getFileStream(file.storagePath);
                        archive.append(fileStream, { name: filePath });
                        continue;
                    }
                    catch (err) {
                        this.logger.warn(`MinIO stream read failed for ${file.storagePath}: ${err}`);
                    }
                }
                if (file.storagePath && fs.existsSync(file.storagePath)) {
                    archive.append(fs.createReadStream(file.storagePath), { name: filePath });
                }
            }
            if (node.studyTaggingFile?.stfXmlContent) {
                const stfPath = this.getStfPath(node, basePath);
                if (stfPath)
                    archive.append(node.studyTaggingFile.stfXmlContent, { name: stfPath });
            }
        }
        archive.finalize().then(() => {
            this.prisma.sequence.update({
                where: { id: sequenceId },
                data: { status: 'EXPORTED' },
            }).catch((e) => this.logger.warn(`Failed to update sequence status: ${e}`));
        });
        return {
            stream: passThrough,
            fileName: `${appNumber}_${seqNumber}_ectd.zip`,
        };
    }
    async buildZip(basePath, sequence, cnRegionalContent, indexContent, indexMd5Content) {
        return new Promise(async (resolve, reject) => {
            const chunks = [];
            const writable = new stream_1.Writable({
                write(chunk, _encoding, callback) {
                    chunks.push(chunk);
                    callback();
                },
            });
            const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
            archive.on('error', reject);
            writable.on('finish', () => resolve(Buffer.concat(chunks)));
            archive.pipe(writable);
            archive.append(indexContent, { name: `${basePath}/index.xml` });
            archive.append(indexMd5Content, { name: `${basePath}/index-md5.txt` });
            archive.append(cnRegionalContent, {
                name: `${basePath}/m1/cn/cn-regional.xml`,
            });
            this.addUtilFiles(archive, basePath);
            for (const node of sequence.sequenceNodes) {
                if (!node.isLeaf || !node.operation || node.operation === 'DELETE')
                    continue;
                const files = node.fileAttachments || [];
                if (files.length === 0)
                    continue;
                for (const file of files) {
                    const filePath = `${basePath}/${file.ectdRelativePath}`;
                    if (file.isReference && file.referenceFileId) {
                        continue;
                    }
                    if (this.minioService && file.storagePath) {
                        try {
                            const exists = await this.minioService.fileExists(file.storagePath);
                            if (exists) {
                                const fileBuffer = await this.minioService.getFile(file.storagePath);
                                archive.append(fileBuffer, { name: filePath });
                                continue;
                            }
                        }
                        catch (err) {
                            this.logger.warn(`MinIO read failed for ${file.storagePath}: ${err}`);
                        }
                    }
                    if (file.storagePath && fs.existsSync(file.storagePath)) {
                        archive.file(file.storagePath, { name: filePath });
                    }
                }
                if (node.studyTaggingFile?.stfXmlContent) {
                    const stfPath = this.getStfPath(node, basePath);
                    if (stfPath) {
                        archive.append(node.studyTaggingFile.stfXmlContent, {
                            name: stfPath,
                        });
                    }
                }
            }
            archive.finalize();
        });
    }
    addUtilFiles(archive, basePath) {
        const utilMappings = [
            {
                src: '附件1-1：区域Schema文件/cn-regional-1-0.xsd',
                dest: 'util/dtd/cn-regional-1-0.xsd',
            },
            {
                src: '附件2-1：ICH DTD文件/ich-ectd-3-2.dtd',
                dest: 'util/dtd/ich-ectd-3-2.dtd',
            },
            {
                src: '附件2-2：ICH STF DTD文件/ich-stf-v2-2.dtd',
                dest: 'util/dtd/ich-stf-v2-2.dtd',
            },
            {
                src: '附件3-1：w3c标准xlink结构定义文件/xlink.xsd',
                dest: 'util/dtd/xlink.xsd',
            },
            {
                src: '附件3-2：w3c标准xml命名规范定义文件/xml.xsd',
                dest: 'util/dtd/xml.xsd',
            },
            {
                src: '附件1-3：区域性样式文件/cn-regional-1-1.xsl',
                dest: 'util/style/cn-regional-1-1.xsl',
            },
            {
                src: '附件2-3：ICH样式文件/ectd-2-0.xsl',
                dest: 'util/style/ectd-2-0.xsl',
            },
            {
                src: '附件2-5：ICH STF样式文件2-3/ich-stf-stylesheet-2-3.xsl',
                dest: 'util/style/ich-stf-stylesheet-2-3.xsl',
            },
            {
                src: '附件2-4：ICH STF样式文件2-2a/ich-stf-stylesheet-2-2a.xsl',
                dest: 'util/style/ich-stf-stylesheet-2-2a.xsl',
            },
            {
                src: '附件2-6：STF标签值文件/valid-values.xml',
                dest: 'util/style/valid-values.xml',
            },
        ];
        for (const mapping of utilMappings) {
            const srcPath = path.join(this.utilSourceBase, mapping.src);
            if (fs.existsSync(srcPath)) {
                archive.file(srcPath, { name: `${basePath}/${mapping.dest}` });
            }
            else {
                this.logger.warn(`Reference file not found: ${srcPath}`);
            }
        }
    }
    getStfPath(node, basePath) {
        const sectionNum = node.ctdSectionNumber;
        if (!sectionNum)
            return null;
        const normalizedSection = sectionNum.replace(/\./g, '-');
        const moduleNum = parseInt(sectionNum.split('.')[0]);
        const moduleFolder = MODULE_FOLDER_MAP[moduleNum];
        if (!moduleFolder)
            return null;
        const prefix = sectionNum.split('.').slice(0, 2).join('.');
        const subFolder = MODULE_SUBFOLDERS[prefix] || moduleFolder;
        return `${basePath}/${subFolder}/stf-${normalizedSection}.xml`;
    }
    async previewStructure(sequenceId) {
        const sequence = await this.prisma.sequence.findUnique({
            where: { id: sequenceId },
            include: {
                regulatoryActivity: {
                    include: { application: { select: { applicationNumber: true } } },
                },
                sequenceNodes: {
                    include: {
                        templateNode: { select: { module: true } },
                        fileAttachments: { select: { ectdRelativePath: true, isReference: true } },
                        studyTaggingFile: { select: { id: true } },
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (!sequence)
            return [];
        const appNumber = sequence.regulatoryActivity.application.applicationNumber;
        const seqNumber = sequence.sequenceNumber;
        const basePath = `${appNumber}/${seqNumber}`;
        const paths = [];
        paths.push(`${basePath}/index.xml`);
        paths.push(`${basePath}/index-md5.txt`);
        paths.push(`${basePath}/m1/cn/cn-regional.xml`);
        paths.push(`${basePath}/util/dtd/cn-regional-1-0.xsd`);
        paths.push(`${basePath}/util/dtd/ich-ectd-3-2.dtd`);
        paths.push(`${basePath}/util/dtd/ich-stf-v2-2.dtd`);
        paths.push(`${basePath}/util/dtd/xlink.xsd`);
        paths.push(`${basePath}/util/dtd/xml.xsd`);
        paths.push(`${basePath}/util/style/cn-regional-1-1.xsl`);
        paths.push(`${basePath}/util/style/ectd-2-0.xsl`);
        paths.push(`${basePath}/util/style/ich-stf-stylesheet-2-3.xsl`);
        paths.push(`${basePath}/util/style/ich-stf-stylesheet-2-2a.xsl`);
        paths.push(`${basePath}/util/style/valid-values.xml`);
        for (const node of sequence.sequenceNodes) {
            if (!node.isLeaf || !node.operation || node.operation === 'DELETE')
                continue;
            const files = node.fileAttachments || [];
            if (files.length === 0)
                continue;
            for (const file of files) {
                if (file.isReference)
                    continue;
                paths.push(`${basePath}/${file.ectdRelativePath}`);
            }
            if (node.studyTaggingFile) {
                const stfPath = this.getStfPath(node, basePath);
                if (stfPath)
                    paths.push(stfPath);
            }
        }
        return paths.sort();
    }
};
exports.PackageAssemblerService = PackageAssemblerService;
exports.PackageAssemblerService = PackageAssemblerService = PackageAssemblerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)(minio_service_1.MinioService)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cn_regional_xml_service_1.CnRegionalXmlService,
        index_xml_service_1.IndexXmlService,
        md5_service_1.Md5Service,
        validator_service_1.ValidatorService,
        minio_service_1.MinioService])
], PackageAssemblerService);
//# sourceMappingURL=package-assembler.service.js.map