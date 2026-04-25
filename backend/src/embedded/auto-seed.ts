import * as bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Idempotent first-run seed used by the embedded build.
 *
 * Behavior:
 *   - `user` empty → create admin user (admin@ectd.com / admin123). Customer
 *     is expected to change the password on first login.
 *   - `ctd_template_node` empty → log a warning and skip. CTD template seed
 *     reads ~30 XML files under `reference/eCTD技术规范V1.1附件包/`, which we
 *     don't ship with the desktop binary. The packaged build instead bundles
 *     a pre-seeded `first-run.db` produced by `scripts/build-embed.js`; the
 *     Electron main copies it to `<userData>/data.db` if no DB file exists.
 *     This function only runs against an already-existing DB, so an empty
 *     ctd_template_node table here means the bundled snapshot was never
 *     copied — operator action required.
 *
 * Re-running on a populated DB is a no-op.
 */
export interface AutoSeedOptions {
  prisma: PrismaService;
  /** Optional logger */
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
  /**
   * Override CTD seed behavior:
   *   - `false` (default): warn-and-skip
   *   - function: caller-supplied seeder (used by the build-embed script
   *     when assembling `first-run.db`)
   */
  ctdSeed?: false | ((prisma: PrismaService) => Promise<void>);
}

export async function autoSeedIfEmpty(options: AutoSeedOptions): Promise<{
  seededUsers: boolean;
  seededCtdTemplate: boolean;
}> {
  const { prisma } = options;
  const log = options.logger ?? {
    info: (m) => console.log(`[auto-seed] ${m}`),
    warn: (m) => console.warn(`[auto-seed] ${m}`),
  };

  const result = { seededUsers: false, seededCtdTemplate: false };

  const userCount = await (prisma as any).user.count();
  if (userCount === 0) {
    const adminPassword = await bcrypt.hash('admin123', 10);
    await (prisma as any).user.create({
      data: {
        email: 'admin@ectd.com',
        passwordHash: adminPassword,
        name: '系统管理员',
        role: 'ADMIN',
      },
    });
    log.info('seeded default admin user (admin@ectd.com / admin123)');
    result.seededUsers = true;
  } else {
    log.info(`users exist (${userCount}), skipping user seed`);
  }

  const ctdCount = await (prisma as any).ctdTemplateNode.count();
  if (ctdCount === 0) {
    if (typeof options.ctdSeed === 'function') {
      await options.ctdSeed(prisma);
      log.info('seeded CTD template + completeness rules via caller-supplied runner');
      result.seededCtdTemplate = true;
    } else {
      log.warn(
        'ctd_template_node is empty; CTD authoring will be unusable. ' +
          'Expected the bundled first-run.db snapshot to populate it. ' +
          'Run `npm run seed:ctd` against this DB if you need to recover.',
      );
    }
  } else {
    log.info(`ctd_template_node exists (${ctdCount} rows), skipping ctd seed`);
  }

  return result;
}
