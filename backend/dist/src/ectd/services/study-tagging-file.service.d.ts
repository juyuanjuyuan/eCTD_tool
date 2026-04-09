export type StfOperation = 'NEW' | 'REPLACE' | 'APPEND' | 'DELETE';
export interface StfCategoryInput {
    name: string;
    value: string;
    infoType: string;
}
export interface StfDocumentInput {
    leafId: string;
    href: string;
    title: string;
    checksum: string;
    fileTag: string;
    fileTagInfoType: string;
    xmlLang?: string;
    operation?: StfOperation;
    modifiedFromHref?: string;
}
export interface StfStudyInput {
    id: string;
    studyId: string;
    title: string;
    operation: StfOperation;
    modifiedFromStfHref?: string;
    categories: StfCategoryInput[];
    documents: StfDocumentInput[];
}
export interface StfParseResult {
    studyId: string;
    title: string;
    dtdVersion: string;
    categories: Array<{
        name: string;
        value: string;
        infoType: string;
    }>;
    documents: Array<{
        leafId: string;
        href: string;
        title: string;
        checksum: string;
        fileTag: string;
        fileTagInfoType: string;
        xmlLang?: string;
        operation?: string;
        modifiedFromHref?: string;
    }>;
}
export interface StfValidationResult {
    valid: boolean;
    errors: string[];
}
export declare class StudyTaggingFileService {
    private readonly xmlParser;
    generateStfXml(input: StfStudyInput): string;
    parseStfXml(xml: string): StfParseResult;
    computeStfChecksum(xml: string): string;
    validateStructure(xml: string): StfValidationResult;
    private buildDocContent;
    private escapeXml;
    private escapeAttr;
    private toArray;
    private readText;
}
