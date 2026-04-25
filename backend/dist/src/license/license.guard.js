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
exports.LicenseGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const license_service_1 = require("./license.service");
const public_decorator_1 = require("./public.decorator");
let LicenseGuard = class LicenseGuard {
    reflector;
    licenseService;
    constructor(reflector, licenseService) {
        this.reflector = reflector;
        this.licenseService = licenseService;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_LICENSE_ROUTE, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic)
            return true;
        if (!this.licenseService.isEnforced()) {
            return true;
        }
        const allowed = await this.licenseService.isAccessAllowed();
        if (!allowed) {
            throw new common_1.ForbiddenException('本机未激活或激活码已过期，请前往「设置 → 激活」页面完成激活');
        }
        return true;
    }
};
exports.LicenseGuard = LicenseGuard;
exports.LicenseGuard = LicenseGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        license_service_1.LicenseService])
], LicenseGuard);
//# sourceMappingURL=license.guard.js.map