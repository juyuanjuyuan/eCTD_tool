"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_controller_1 = require("./auth.controller");
describe('AuthController', () => {
    let controller;
    let service;
    beforeEach(() => {
        service = {
            register: jest.fn().mockResolvedValue({ user: { id: 'u1' }, accessToken: 'at' }),
            login: jest.fn().mockResolvedValue({ user: { id: 'u1' }, accessToken: 'at' }),
            refreshToken: jest.fn().mockResolvedValue({ accessToken: 'new-at' }),
            getProfile: jest.fn().mockResolvedValue({ id: 'u1', name: '张三' }),
        };
        controller = new auth_controller_1.AuthController(service);
    });
    it('should register', async () => {
        const result = await controller.register({ email: 'a@b.com', password: '123', name: '张三' });
        expect(result.accessToken).toBe('at');
    });
    it('should login', async () => {
        const result = await controller.login({ email: 'a@b.com', password: '123' });
        expect(result.accessToken).toBe('at');
    });
    it('should refresh token', async () => {
        const result = await controller.refresh({ refreshToken: 'rt' });
        expect(result.accessToken).toBe('new-at');
    });
    it('should get profile', async () => {
        const result = await controller.getProfile('u1');
        expect(result).not.toBeNull();
        expect(result.name).toBe('张三');
    });
});
//# sourceMappingURL=auth.controller.spec.js.map