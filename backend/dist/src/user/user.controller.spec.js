"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const user_controller_1 = require("./user.controller");
describe('UserController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
            findOne: jest.fn().mockResolvedValue({ id: 'user-1' }),
            update: jest.fn().mockResolvedValue({ id: 'user-1' }),
            disable: jest.fn().mockResolvedValue({ status: 'DISABLED' }),
        };
        controller = new user_controller_1.UserController(service);
    });
    it('should find all users', async () => {
        await controller.findAll({});
        expect(service.findAll).toHaveBeenCalled();
    });
    it('should find one user', async () => {
        const result = await controller.findOne('user-1');
        expect(result.id).toBe('user-1');
    });
    it('should update user', async () => {
        await controller.update('user-1', { name: '新名' });
        expect(service.update).toHaveBeenCalledWith('user-1', { name: '新名' });
    });
    it('should disable user', async () => {
        const result = await controller.disable('user-1');
        expect(result.status).toBe('DISABLED');
    });
});
//# sourceMappingURL=user.controller.spec.js.map