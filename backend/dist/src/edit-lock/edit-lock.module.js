"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EditLockModule = void 0;
const common_1 = require("@nestjs/common");
const edit_lock_controller_1 = require("./edit-lock.controller");
const edit_lock_service_1 = require("./edit-lock.service");
let EditLockModule = class EditLockModule {
};
exports.EditLockModule = EditLockModule;
exports.EditLockModule = EditLockModule = __decorate([
    (0, common_1.Module)({
        controllers: [edit_lock_controller_1.EditLockController],
        providers: [edit_lock_service_1.EditLockService],
        exports: [edit_lock_service_1.EditLockService],
    })
], EditLockModule);
//# sourceMappingURL=edit-lock.module.js.map