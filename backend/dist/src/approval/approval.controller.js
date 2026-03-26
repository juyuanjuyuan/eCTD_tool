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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SequenceApprovalController = exports.ApprovalController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../common/guards/roles.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const approval_service_1 = require("./approval.service");
const dto_1 = require("./dto");
let ApprovalController = class ApprovalController {
    approvalService;
    constructor(approvalService) {
        this.approvalService = approvalService;
    }
    submit(nodeId, userId) {
        return this.approvalService.submitForApproval(nodeId, userId);
    }
    approve(nodeId, userId) {
        return this.approvalService.approveNode(nodeId, userId);
    }
    reject(nodeId, userId, dto) {
        return this.approvalService.rejectNode(nodeId, userId, dto.reason);
    }
    unlockApproval(nodeId) {
        return this.approvalService.unlockApproval(nodeId);
    }
    getHistory(nodeId) {
        return this.approvalService.getApprovalHistory(nodeId);
    }
};
exports.ApprovalController = ApprovalController;
__decorate([
    (0, common_1.Post)('submit'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ApprovalController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)('approve'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ADMIN', 'MANAGER'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ApprovalController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)('reject'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ADMIN', 'MANAGER'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, dto_1.RejectApprovalDto]),
    __metadata("design:returntype", void 0)
], ApprovalController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)('unlock-approval'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('ADMIN', 'MANAGER'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApprovalController.prototype, "unlockApproval", null);
__decorate([
    (0, common_1.Get)('approval-history'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ApprovalController.prototype, "getHistory", null);
exports.ApprovalController = ApprovalController = __decorate([
    (0, common_1.Controller)('api/v1/nodes/:nodeId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [approval_service_1.ApprovalService])
], ApprovalController);
let SequenceApprovalController = class SequenceApprovalController {
    approvalService;
    constructor(approvalService) {
        this.approvalService = approvalService;
    }
    getApprovalStatus(seqId) {
        return this.approvalService.getSequenceApprovalStatus(seqId);
    }
};
exports.SequenceApprovalController = SequenceApprovalController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SequenceApprovalController.prototype, "getApprovalStatus", null);
exports.SequenceApprovalController = SequenceApprovalController = __decorate([
    (0, common_1.Controller)('api/v1/sequences/:seqId/approval-status'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [approval_service_1.ApprovalService])
], SequenceApprovalController);
//# sourceMappingURL=approval.controller.js.map