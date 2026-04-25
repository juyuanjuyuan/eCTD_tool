"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const application_controller_1 = require("./application.controller");
describe('ApplicationController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            create: jest.fn().mockResolvedValue({ id: 'app-1' }),
            findAllByProject: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: 'app-1' }),
            remove: jest.fn().mockResolvedValue({}),
        };
        const sequenceService = {
            createWithRegulatoryActivity: jest.fn().mockResolvedValue({ id: 'seq-1', sequenceNumber: '0000' }),
        };
        controller = new application_controller_1.ApplicationController(service, sequenceService);
    });
    it('should create application', async () => {
        await controller.create('proj-1', { applicationTypeCode: 'cnapt2' });
        expect(service.create).toHaveBeenCalledWith('proj-1', { applicationTypeCode: 'cnapt2' });
    });
    it('should find all applications', async () => {
        await controller.findAll('proj-1');
        expect(service.findAllByProject).toHaveBeenCalledWith('proj-1');
    });
    it('should find one', async () => {
        const result = await controller.findOne('app-1');
        expect(result.id).toBe('app-1');
    });
    it('should remove', async () => {
        await controller.remove('app-1');
        expect(service.remove).toHaveBeenCalledWith('app-1');
    });
});
//# sourceMappingURL=application.controller.spec.js.map