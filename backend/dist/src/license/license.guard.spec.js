"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const license_guard_1 = require("./license.guard");
function makeContext(handler, classRef = function FakeController() { }) {
    return {
        getHandler: () => handler,
        getClass: () => classRef,
    };
}
describe('LicenseGuard', () => {
    let reflector;
    let licenseService;
    let guard;
    beforeEach(() => {
        reflector = new core_1.Reflector();
        licenseService = {
            isEnforced: jest.fn(),
            isAccessAllowed: jest.fn(),
        };
        guard = new license_guard_1.LicenseGuard(reflector, licenseService);
    });
    it('allows @Public() routes regardless of license state', async () => {
        const handler = function publicHandler() { };
        Reflect.defineMetadata('license:public', true, handler);
        licenseService.isEnforced.mockReturnValue(true);
        licenseService.isAccessAllowed.mockResolvedValue(false);
        const ctx = makeContext(handler);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(licenseService.isAccessAllowed).not.toHaveBeenCalled();
    });
    it('allows everything when enforcement disabled', async () => {
        licenseService.isEnforced.mockReturnValue(false);
        const handler = function biz() { };
        const ctx = makeContext(handler);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
        expect(licenseService.isAccessAllowed).not.toHaveBeenCalled();
    });
    it('passes when enforcement on AND access allowed', async () => {
        licenseService.isEnforced.mockReturnValue(true);
        licenseService.isAccessAllowed.mockResolvedValue(true);
        const handler = function biz() { };
        const ctx = makeContext(handler);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
    it('throws ForbiddenException when enforcement on AND access denied', async () => {
        licenseService.isEnforced.mockReturnValue(true);
        licenseService.isAccessAllowed.mockResolvedValue(false);
        const handler = function biz() { };
        const ctx = makeContext(handler);
        await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(common_1.ForbiddenException);
    });
    it('respects @Public() set on the controller class', async () => {
        licenseService.isEnforced.mockReturnValue(true);
        licenseService.isAccessAllowed.mockResolvedValue(false);
        const handler = function biz() { };
        const cls = function PublicController() { };
        Reflect.defineMetadata('license:public', true, cls);
        const ctx = makeContext(handler, cls);
        await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });
});
//# sourceMappingURL=license.guard.spec.js.map