"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const md5_service_1 = require("./md5.service");
describe('Md5Service', () => {
    let service;
    beforeEach(() => {
        service = new md5_service_1.Md5Service();
    });
    describe('calculateMd5', () => {
        it('should calculate correct MD5 for a known buffer', () => {
            const buffer = Buffer.from('hello world');
            expect(service.calculateMd5(buffer)).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
        });
        it('should return different hashes for different content', () => {
            const buf1 = Buffer.from('content1');
            const buf2 = Buffer.from('content2');
            expect(service.calculateMd5(buf1)).not.toBe(service.calculateMd5(buf2));
        });
        it('should handle empty buffer', () => {
            const empty = Buffer.alloc(0);
            expect(service.calculateMd5(empty)).toBe('d41d8cd98f00b204e9800998ecf8427e');
        });
    });
    describe('calculateMd5String', () => {
        it('should calculate correct MD5 for a string', () => {
            expect(service.calculateMd5String('hello world')).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
        });
        it('should handle Chinese characters (UTF-8)', () => {
            const hash = service.calculateMd5String('中文测试');
            expect(hash).toHaveLength(32);
            expect(/^[a-f0-9]{32}$/.test(hash)).toBe(true);
        });
        it('should handle empty string', () => {
            expect(service.calculateMd5String('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
        });
    });
    describe('generateIndexMd5', () => {
        it('should generate correct index-md5.txt format', () => {
            const files = [
                { fileName: 'index.xml', content: '<xml/>' },
                { fileName: 'cn-regional.xml', content: '<cn/>' },
            ];
            const result = service.generateIndexMd5(files);
            const lines = result.trim().split('\n');
            expect(lines).toHaveLength(2);
            expect(lines[0]).toMatch(/^[a-f0-9]{32}  index\.xml$/);
            expect(lines[1]).toMatch(/^[a-f0-9]{32}  cn-regional\.xml$/);
        });
        it('should end with a newline', () => {
            const files = [{ fileName: 'test.xml', content: 'test' }];
            const result = service.generateIndexMd5(files);
            expect(result.endsWith('\n')).toBe(true);
        });
        it('should produce consistent hashes for same content', () => {
            const files = [{ fileName: 'index.xml', content: 'test-content' }];
            const result1 = service.generateIndexMd5(files);
            const result2 = service.generateIndexMd5(files);
            expect(result1).toBe(result2);
        });
    });
    describe('generateLeafId', () => {
        it('should start with N (not a digit)', () => {
            const id = service.generateLeafId();
            expect(id.charAt(0)).toBe('N');
        });
        it('should not contain hyphens', () => {
            const id = service.generateLeafId();
            expect(id).not.toContain('-');
        });
        it('should be unique across calls', () => {
            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(service.generateLeafId());
            }
            expect(ids.size).toBe(100);
        });
        it('should have length of 33 (N + 32 hex chars)', () => {
            const id = service.generateLeafId();
            expect(id).toHaveLength(33);
        });
    });
});
//# sourceMappingURL=md5.service.spec.js.map