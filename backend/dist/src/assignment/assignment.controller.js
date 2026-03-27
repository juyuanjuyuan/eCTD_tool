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
exports.AssignmentController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const assignment_service_1 = require("./assignment.service");
let AssignmentController = class AssignmentController {
    assignmentService;
    constructor(assignmentService) {
        this.assignmentService = assignmentService;
    }
    assignNode(nodeId, body, userId) {
        const assignments = Array.isArray(body) ? body : [body];
        return this.assignmentService.assignNode(nodeId, assignments, userId);
    }
    getNodeAssignments(nodeId) {
        return this.assignmentService.getNodeAssignments(nodeId);
    }
    removeAssignment(nodeId, targetUserId, userId) {
        return this.assignmentService.removeAssignment(nodeId, targetUserId, userId);
    }
    getSequenceOverview(seqId) {
        return this.assignmentService.getSequenceAssignmentOverview(seqId);
    }
};
exports.AssignmentController = AssignmentController;
__decorate([
    (0, common_1.Post)('nodes/:nodeId/assignments'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], AssignmentController.prototype, "assignNode", null);
__decorate([
    (0, common_1.Get)('nodes/:nodeId/assignments'),
    __param(0, (0, common_1.Param)('nodeId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AssignmentController.prototype, "getNodeAssignments", null);
__decorate([
    (0, common_1.Delete)('nodes/:nodeId/assignments/:targetUserId'),
    __param(0, (0, common_1.Param)('nodeId')),
    __param(1, (0, common_1.Param)('targetUserId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], AssignmentController.prototype, "removeAssignment", null);
__decorate([
    (0, common_1.Get)('sequences/:seqId/assignments/overview'),
    __param(0, (0, common_1.Param)('seqId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AssignmentController.prototype, "getSequenceOverview", null);
exports.AssignmentController = AssignmentController = __decorate([
    (0, common_1.Controller)('api/v1'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [assignment_service_1.AssignmentService])
], AssignmentController);
//# sourceMappingURL=assignment.controller.js.map