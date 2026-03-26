export declare class SaveStfDto {
    studyTitle: string;
    studyId: string;
    categories?: Record<string, string>;
    fileTags?: Array<{
        name: string;
        infoType: string;
    }>;
}
export declare class ValidateOperationDto {
    operation: string;
}
