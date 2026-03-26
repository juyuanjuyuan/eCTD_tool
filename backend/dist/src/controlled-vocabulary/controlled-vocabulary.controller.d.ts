import { ControlledVocabularyService } from './controlled-vocabulary.service';
export declare class ControlledVocabularyController {
    private readonly cvService;
    constructor(cvService: ControlledVocabularyService);
    getApplicationTypes(): Promise<{}>;
    getProductTypes(): Promise<{}>;
    getRegulatoryActivityTypes(appType?: string): Promise<{}>;
    getSequenceTypes(appType?: string, ratType?: string): Promise<{}>;
}
