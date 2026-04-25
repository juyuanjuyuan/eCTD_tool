"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const regulatory_activity_controller_1 = require("./regulatory-activity.controller");
describe('RegulatoryActivityController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            create: jest.fn().mockResolvedValue({ id: 'ra-1' }),
            findAllByApplication: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: 'ra-1' }),
        };
        controller = new regulatory_activity_controller_1.RegulatoryActivityController(service);
    });
    it('should create', async () => {
        await controller.create('app-1', { regulatoryActivityTypeCode: 'cnrat1' });
        expect(service.create).toHaveBeenCalledWith('app-1', { regulatoryActivityTypeCode: 'cnrat1' });
    });
    it('should find all', async () => {
        await controller.findAll('app-1');
        expect(service.findAllByApplication).toHaveBeenCalledWith('app-1');
    });
    it('should find one', async () => {
        const result = await controller.findOne('ra-1');
        expect(result.id).toBe('ra-1');
    });
});
//# sourceMappingURL=regulatory-activity.controller.spec.js.map