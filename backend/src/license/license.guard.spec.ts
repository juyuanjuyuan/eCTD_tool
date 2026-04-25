import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { LicenseGuard } from './license.guard';
import { LicenseService } from './license.service';

function makeContext(handler: () => unknown, classRef: any = function FakeController() {}): any {
  return {
    getHandler: () => handler,
    getClass: () => classRef,
  };
}

describe('LicenseGuard', () => {
  let reflector: Reflector;
  let licenseService: jest.Mocked<Pick<LicenseService, 'isEnforced' | 'isAccessAllowed'>>;
  let guard: LicenseGuard;

  beforeEach(() => {
    reflector = new Reflector();
    licenseService = {
      isEnforced: jest.fn(),
      isAccessAllowed: jest.fn(),
    };
    guard = new LicenseGuard(reflector, licenseService as unknown as LicenseService);
  });

  it('allows @Public() routes regardless of license state', async () => {
    const handler = function publicHandler() {};
    Reflect.defineMetadata('license:public', true, handler);
    licenseService.isEnforced.mockReturnValue(true);
    licenseService.isAccessAllowed.mockResolvedValue(false);

    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(licenseService.isAccessAllowed).not.toHaveBeenCalled();
  });

  it('allows everything when enforcement disabled', async () => {
    licenseService.isEnforced.mockReturnValue(false);
    const handler = function biz() {};
    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(licenseService.isAccessAllowed).not.toHaveBeenCalled();
  });

  it('passes when enforcement on AND access allowed', async () => {
    licenseService.isEnforced.mockReturnValue(true);
    licenseService.isAccessAllowed.mockResolvedValue(true);
    const handler = function biz() {};
    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException when enforcement on AND access denied', async () => {
    licenseService.isEnforced.mockReturnValue(true);
    licenseService.isAccessAllowed.mockResolvedValue(false);
    const handler = function biz() {};
    const ctx = makeContext(handler);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('respects @Public() set on the controller class', async () => {
    licenseService.isEnforced.mockReturnValue(true);
    licenseService.isAccessAllowed.mockResolvedValue(false);
    const handler = function biz() {};
    const cls = function PublicController() {};
    Reflect.defineMetadata('license:public', true, cls);
    const ctx = makeContext(handler, cls);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
