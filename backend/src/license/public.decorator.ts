import { SetMetadata } from '@nestjs/common';

/**
 * Mark a route handler (or controller) as exempt from `LicenseGuard` enforcement.
 * Used for endpoints that must keep working even when the machine has no valid license,
 * e.g. health checks, login, and license activation itself.
 */
export const IS_PUBLIC_LICENSE_ROUTE = 'license:public';
export const Public = () => SetMetadata(IS_PUBLIC_LICENSE_ROUTE, true);
