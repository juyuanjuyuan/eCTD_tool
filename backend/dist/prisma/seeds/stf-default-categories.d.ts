import type { PrismaClient } from '@prisma/client';
export interface StfCategoryDimension {
    name: string;
    required: boolean;
}
export declare const ALLOWED_STF_CATEGORY_NAMES: readonly ["species", "route-of-admin", "duration", "type-of-control"];
export type AllowedStfCategoryName = (typeof ALLOWED_STF_CATEGORY_NAMES)[number];
export declare const STF_DEFAULTS: Readonly<Record<string, StfCategoryDimension[]>>;
export declare function validateStfDefaults(): void;
export interface ApplyStfDefaultCategoriesResult {
    updatedSections: number;
    unmatchedSections: string[];
}
export declare function applyStfDefaultCategories(prisma: PrismaClient): Promise<ApplyStfDefaultCategoriesResult>;
export declare function getStfDefaultsForSection(sectionNumber: string): StfCategoryDimension[] | null;
