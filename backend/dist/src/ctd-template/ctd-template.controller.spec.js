"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ctd_template_controller_1 = require("./ctd-template.controller");
describe('CtdTemplateController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            getTemplateTree: jest.fn().mockResolvedValue({ children: [] }),
            getTemplateTreeWithRules: jest.fn().mockResolvedValue({ children: [] }),
            getExtensionNodeOptions: jest.fn().mockReturnValue([]),
            initializeSequenceNodes: jest.fn().mockResolvedValue({ message: '序列目录初始化完成', nodeCount: 10 }),
            previewRequiredSections: jest.fn().mockResolvedValue([]),
            getSequenceNodeTree: jest.fn().mockResolvedValue({ children: [] }),
            updateSequenceNode: jest.fn().mockResolvedValue({ id: 'node-1' }),
            updateBackboneAttributes: jest.fn().mockResolvedValue({ id: 'node-1' }),
            createExtensionNode: jest.fn().mockResolvedValue({ id: 'ext-1' }),
            deleteExtensionNode: jest.fn().mockResolvedValue({ success: true }),
            checkCompleteness: jest.fn().mockResolvedValue({
                totalSections: 10,
                requiredSections: 5,
                completedRequired: 5,
                forbiddenViolations: [],
                missingRequired: [],
                moduleStats: {},
            }),
        };
        controller = new ctd_template_controller_1.CtdTemplateController(service);
    });
    it('should get template tree without rules', async () => {
        const result = await controller.getTemplateTree();
        expect(service.getTemplateTree).toHaveBeenCalled();
    });
    it('should get template tree with rules when appType and ratType provided', async () => {
        await controller.getTemplateTree('cnapt2', 'cnrat1');
        expect(service.getTemplateTreeWithRules).toHaveBeenCalledWith('cnapt2', 'cnrat1');
    });
    it('should get extension options', () => {
        controller.getExtensionOptions();
        expect(service.getExtensionNodeOptions).toHaveBeenCalled();
    });
    it('should initialize sequence', async () => {
        const result = await controller.initializeSequence('seq-1');
        expect(result.nodeCount).toBe(10);
    });
    it('should preview required sections', async () => {
        await controller.previewRequired('seq-1');
        expect(service.previewRequiredSections).toHaveBeenCalledWith('seq-1');
    });
    it('should get sequence node tree', async () => {
        await controller.getSequenceNodeTree('seq-1');
        expect(service.getSequenceNodeTree).toHaveBeenCalledWith('seq-1');
    });
    it('should update sequence node', async () => {
        await controller.updateSequenceNode('seq-1', 'node-1', { operation: 'NEW' });
        expect(service.updateSequenceNode).toHaveBeenCalledWith('seq-1', 'node-1', { operation: 'NEW' });
    });
    it('should update backbone attributes', async () => {
        await controller.updateBackboneAttributes('seq-1', 'node-1', { substance: 'x' });
        expect(service.updateBackboneAttributes).toHaveBeenCalledWith('seq-1', 'node-1', { substance: 'x' });
    });
    it('should create extension node', async () => {
        await controller.createExtensionNode('seq-1', 'parent-1', { extensionType: '3.2.R.1' });
        expect(service.createExtensionNode).toHaveBeenCalledWith('seq-1', 'parent-1', { extensionType: '3.2.R.1' });
    });
    it('should delete extension node', async () => {
        await controller.deleteExtensionNode('seq-1', 'node-1');
        expect(service.deleteExtensionNode).toHaveBeenCalledWith('seq-1', 'node-1');
    });
    it('should check completeness', async () => {
        const result = await controller.checkCompleteness('seq-1');
        expect(result.missingRequired).toHaveLength(0);
        expect(result.completedRequired).toBe(5);
    });
});
//# sourceMappingURL=ctd-template.controller.spec.js.map