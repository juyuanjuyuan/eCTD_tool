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
exports.CollaborationController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../common/guards/jwt-auth.guard");
const collaboration_service_1 = require("./collaboration.service");
let CollaborationController = class CollaborationController {
    collaborationService;
    constructor(collaborationService) {
        this.collaborationService = collaborationService;
    }
    getPresence(projectId) {
        return this.collaborationService.getProjectPresence(projectId);
    }
};
exports.CollaborationController = CollaborationController;
__decorate([
    (0, common_1.Get)(':id/presence'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CollaborationController.prototype, "getPresence", null);
exports.CollaborationController = CollaborationController = __decorate([
    (0, common_1.Controller)('api/v1/projects'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [collaboration_service_1.CollaborationService])
], CollaborationController);
//# sourceMappingURL=collaboration.controller.js.map