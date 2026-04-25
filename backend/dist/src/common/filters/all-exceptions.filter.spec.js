"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const all_exceptions_filter_1 = require("./all-exceptions.filter");
const common_1 = require("@nestjs/common");
describe('AllExceptionsFilter', () => {
    let filter;
    let mockResponse;
    let mockHost;
    beforeEach(() => {
        filter = new all_exceptions_filter_1.AllExceptionsFilter();
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        mockHost = {
            switchToHttp: () => ({
                getResponse: () => mockResponse,
                getRequest: () => ({ url: '/api/test', method: 'GET' }),
            }),
        };
    });
    it('should handle HttpException', () => {
        const exception = new common_1.HttpException('Not Found', common_1.HttpStatus.NOT_FOUND);
        filter.catch(exception, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(404);
        expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 404,
            message: 'Not Found',
            path: '/api/test',
        }));
    });
    it('should handle HttpException with object response', () => {
        const exception = new common_1.HttpException({ message: '验证失败', errors: ['field required'] }, common_1.HttpStatus.BAD_REQUEST);
        filter.catch(exception, mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(400);
        expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
            message: '验证失败',
            errors: ['field required'],
        }));
    });
    it('should handle unknown errors as 500', () => {
        filter.catch(new Error('unexpected'), mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(500);
        expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 500,
            message: '服务器内部错误',
        }));
    });
    it('should handle non-Error exceptions', () => {
        filter.catch('string error', mockHost);
        expect(mockResponse.status).toHaveBeenCalledWith(500);
    });
});
//# sourceMappingURL=all-exceptions.filter.spec.js.map