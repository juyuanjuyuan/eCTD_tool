"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const license_service_1 = require("./license.service");
const license_controller_1 = require("./license.controller");
const license_guard_1 = require("./license.guard");
let LicenseModule = class LicenseModule {
};
exports.LicenseModule = LicenseModule;
exports.LicenseModule = LicenseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        controllers: [license_controller_1.LicenseController],
        providers: [
            license_service_1.LicenseService,
            license_guard_1.LicenseGuard,
            {
                provide: core_1.APP_GUARD,
                useClass: license_guard_1.LicenseGuard,
            },
        ],
        exports: [license_service_1.LicenseService],
    })
], LicenseModule);
//# sourceMappingURL=license.module.js.map