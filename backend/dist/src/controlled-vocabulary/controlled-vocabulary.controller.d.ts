import { ControlledVocabularyService } from './controlled-vocabulary.service';
export declare class ControlledVocabularyController {
    private readonly cvService;
    constructor(cvService: ControlledVocabularyService);
    getApplicationTypes(): Promise<{}>;
    getProductTypes(): Promise<{}>;
    getRegulatoryActivityTypes(appType?: string): Promise<{}>;
    getSequenceTypes(appType?: string, ratType?: string): Promise<{}>;
    getStfCategories(): Promise<{
        name: string;
        values: Array<{
            value: string;
            realm: string;
        }>;
    }[]>;
    getStfCategoryValues(name: string): Promise<{
        value: string;
        realm: string;
    }[]>;
    getStfFileTags(module?: string): Promise<{
        value: string;
        realm: string;
    }[]>;
}
