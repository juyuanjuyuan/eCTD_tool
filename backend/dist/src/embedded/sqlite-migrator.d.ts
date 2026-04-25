export interface RunMigrationsOptions {
    migrationsDir: string;
    databaseFile: string;
    logger?: {
        info: (msg: string) => void;
        warn: (msg: string) => void;
    };
}
export interface MigrationApplied {
    name: string;
    durationMs: number;
}
export declare function runSqliteMigrations(options: RunMigrationsOptions): MigrationApplied[];
