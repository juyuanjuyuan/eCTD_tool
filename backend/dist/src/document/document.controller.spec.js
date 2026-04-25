"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const document_controller_1 = require("./document.controller");
describe('DocumentController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            getDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
            saveDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
            getVersions: jest.fn().mockResolvedValue([]),
            getVersion: jest.fn().mockResolvedValue({ version: 1 }),
            createVersionSnapshot: jest.fn().mockResolvedValue({ version: 2 }),
            restoreVersion: jest.fn().mockResolvedValue({ id: 'doc-1' }),
        };
        controller = new document_controller_1.DocumentController(service);
    });
    it('should get document', async () => {
        const result = await controller.getDocument('node-1');
        expect(result.id).toBe('doc-1');
    });
    it('should save document', async () => {
        await controller.saveDocument('node-1', { contentJson: {}, contentHtml: '<p/>' }, 'user-1');
        expect(service.saveDocument).toHaveBeenCalledWith('node-1', { contentJson: {}, contentHtml: '<p/>' }, 'user-1');
    });
    it('should get versions', async () => {
        await controller.getVersions('node-1');
        expect(service.getVersions).toHaveBeenCalledWith('node-1');
    });
    it('should get specific version', async () => {
        await controller.getVersion('node-1', 1);
        expect(service.getVersion).toHaveBeenCalledWith('node-1', 1);
    });
    it('should create version snapshot', async () => {
        await controller.createVersionSnapshot('node-1', 'user-1');
        expect(service.createVersionSnapshot).toHaveBeenCalledWith('node-1', 'user-1');
    });
    it('should restore version', async () => {
        await controller.restoreVersion('node-1', 1, 'user-1');
        expect(service.restoreVersion).toHaveBeenCalledWith('node-1', 1, 'user-1');
    });
});
//# sourceMappingURL=document.controller.spec.js.map