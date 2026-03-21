import { ControlledVocabularyService } from './controlled-vocabulary.service';
export declare class ControlledVocabularyController {
    private readonly cvService;
    constructor(cvService: ControlledVocabularyService);
    getApplicationTypes(): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getProductTypes(): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getRegulatoryActivityTypes(appType?: string): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
    getSequenceTypes(appType?: string, ratType?: string): Promise<{
        id: string;
        vocabularyName: string;
        code: string;
        version: string;
        validFrom: Date;
        validTo: Date | null;
        descriptionZh: string;
        descriptionEn: string;
    }[]>;
}
