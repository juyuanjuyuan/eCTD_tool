"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DocumentService = class DocumentService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getDocument(nodeId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('序列节点不存在');
        const doc = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!doc) {
            return {
                id: null,
                nodeId,
                contentJson: null,
                contentHtml: '',
                contentText: '',
                wordCount: 0,
                version: 0,
                xmlLang: 'zh',
                createdBy: null,
                updatedBy: null,
                createdAt: null,
                updatedAt: null,
            };
        }
        return doc;
    }
    async saveDocument(nodeId, dto, userId) {
        const node = await this.prisma.sequenceNode.findUnique({
            where: { id: nodeId },
        });
        if (!node)
            throw new common_1.NotFoundException('序列节点不存在');
        if (node.approvalStatus === 'APPROVED') {
            throw new common_1.ForbiddenException('该节点已审批通过，不可编辑');
        }
        const contentText = this.extractText(dto.contentHtml || '');
        const wordCount = this.countWords(contentText);
        const existing = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (existing) {
            const doc = await this.prisma.document.update({
                where: { nodeId },
                data: {
                    contentJson: dto.contentJson ?? undefined,
                    contentHtml: dto.contentHtml ?? undefined,
                    contentText,
                    wordCount,
                    xmlLang: dto.xmlLang ?? undefined,
                    version: { increment: 1 },
                    updatedBy: userId || undefined,
                },
            });
            if (node.status === 'EMPTY') {
                await this.prisma.sequenceNode.update({
                    where: { id: nodeId },
                    data: { status: 'EDITING' },
                });
            }
            return doc;
        }
        else {
            const doc = await this.prisma.document.create({
                data: {
                    nodeId,
                    contentJson: dto.contentJson ?? undefined,
                    contentHtml: dto.contentHtml ?? undefined,
                    contentText,
                    wordCount,
                    version: 1,
                    xmlLang: dto.xmlLang || 'zh',
                    createdBy: userId || undefined,
                    updatedBy: userId || undefined,
                },
            });
            if (node.status === 'EMPTY') {
                await this.prisma.sequenceNode.update({
                    where: { id: nodeId },
                    data: { status: 'EDITING' },
                });
            }
            return doc;
        }
    }
    async getVersions(nodeId) {
        const doc = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!doc)
            return [];
        return this.prisma.documentVersion.findMany({
            where: { documentId: doc.id },
            orderBy: { version: 'desc' },
            select: {
                id: true,
                version: true,
                wordCount: true,
                xmlLang: true,
                createdBy: true,
                createdAt: true,
            },
        });
    }
    async getVersion(nodeId, version) {
        const doc = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!doc)
            throw new common_1.NotFoundException('文档不存在');
        const ver = await this.prisma.documentVersion.findFirst({
            where: { documentId: doc.id, version },
        });
        if (!ver)
            throw new common_1.NotFoundException(`版本 ${version} 不存在`);
        return ver;
    }
    async createVersionSnapshot(nodeId, userId) {
        const doc = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!doc)
            throw new common_1.NotFoundException('文档不存在');
        return this.prisma.documentVersion.create({
            data: {
                documentId: doc.id,
                version: doc.version,
                contentJson: doc.contentJson ?? undefined,
                contentHtml: doc.contentHtml ?? undefined,
                wordCount: doc.wordCount,
                xmlLang: doc.xmlLang,
                createdBy: userId || doc.updatedBy,
            },
        });
    }
    async restoreVersion(nodeId, version, userId) {
        const doc = await this.prisma.document.findUnique({
            where: { nodeId },
        });
        if (!doc)
            throw new common_1.NotFoundException('文档不存在');
        const ver = await this.prisma.documentVersion.findFirst({
            where: { documentId: doc.id, version },
        });
        if (!ver)
            throw new common_1.NotFoundException(`版本 ${version} 不存在`);
        await this.prisma.documentVersion.create({
            data: {
                documentId: doc.id,
                version: doc.version,
                contentJson: doc.contentJson ?? undefined,
                contentHtml: doc.contentHtml ?? undefined,
                wordCount: doc.wordCount,
                xmlLang: doc.xmlLang,
                createdBy: doc.updatedBy,
            },
        });
        const contentText = this.extractText(ver.contentHtml || '');
        return this.prisma.document.update({
            where: { nodeId },
            data: {
                contentJson: ver.contentJson ?? undefined,
                contentHtml: ver.contentHtml ?? undefined,
                contentText,
                wordCount: ver.wordCount,
                xmlLang: ver.xmlLang,
                version: { increment: 1 },
                updatedBy: userId || undefined,
            },
        });
    }
    extractText(html) {
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    }
    countWords(text) {
        if (!text)
            return 0;
        const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const englishWords = text
            .replace(/[\u4e00-\u9fff]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 0).length;
        return chineseChars + englishWords;
    }
};
exports.DocumentService = DocumentService;
exports.DocumentService = DocumentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DocumentService);
//# sourceMappingURL=document.service.js.map