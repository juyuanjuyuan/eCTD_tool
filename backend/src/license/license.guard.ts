import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LicenseService } from './license.service';
import { IS_PUBLIC_LICENSE_ROUTE } from './public.decorator';

/**
 * Global guard. Blocks every business endpoint when the machine is not activated
 * (or the active license is no longer valid). Whitelisted via @Public():
 *   - /health
 *   - /api/v1/auth/* (login/refresh/me)
 *   - /api/v1/license/* (status/activate)
 */
@Injectable()
export class LicenseGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly licenseService: LicenseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_LICENSE_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (!this.licenseService.isEnforced()) {
      return true;
    }

    const allowed = await this.licenseService.isAccessAllowed();
    if (!allowed) {
      throw new ForbiddenException(
        '本机未激活或激活码已过期，请前往「设置 → 激活」页面完成激活',
      );
    }
    return true;
  }
}
