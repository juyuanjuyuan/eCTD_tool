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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Md5Service = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
let Md5Service = class Md5Service {
    calculateMd5(buffer) {
        return crypto.createHash('md5').update(buffer).digest('hex');
    }
    calculateMd5String(content) {
        return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
    }
    generateIndexMd5(files) {
        const lines = files.map((f) => {
            const md5 = this.calculateMd5String(f.content);
            return `${md5}  ${f.fileName}`;
        });
        return lines.join('\n') + '\n';
    }
    generateLeafId() {
        const uuid = crypto.randomUUID().replace(/-/g, '');
        return `N${uuid}`;
    }
};
exports.Md5Service = Md5Service;
exports.Md5Service = Md5Service = __decorate([
    (0, common_1.Injectable)()
], Md5Service);
//# sourceMappingURL=md5.service.js.map