"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../src/app.module");
const transform_interceptor_1 = require("../src/common/interceptors/transform.interceptor");
const all_exceptions_filter_1 = require("../src/common/filters/all-exceptions.filter");
describe('eCTD Tool API (e2e)', () => {
    let app;
    let accessToken;
    let projectId;
    let applicationId;
    let regulatoryActivityId;
    let sequenceId;
    beforeAll(async () => {
        if (!process.env.DATABASE_URL) {
            console.warn('DATABASE_URL not set, skipping e2e tests');
            return;
        }
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: true },
        }));
        app.useGlobalInterceptors(new transform_interceptor_1.TransformInterceptor());
        app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
        await app.init();
    }, 30000);
    afterAll(async () => {
        if (app)
            await app.close();
    });
    describe('Auth Flow', () => {
        it('POST /api/v1/auth/register — should register a new user', async () => {
            if (!app)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send({
                email: `e2e-test-${Date.now()}@example.com`,
                password: 'TestPassword123!',
                name: 'E2E Test User',
            });
            expect([201, 400]).toContain(res.status);
        });
        it('POST /api/v1/auth/login — should login and get tokens', async () => {
            if (!app)
                return;
            const email = `e2e-login-${Date.now()}@example.com`;
            await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/auth/register')
                .send({ email, password: 'TestPassword123!', name: 'Test' });
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/auth/login')
                .send({ email, password: 'TestPassword123!' });
            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('accessToken');
            expect(res.body.data).toHaveProperty('refreshToken');
            accessToken = res.body.data.accessToken;
        });
        it('GET /api/v1/auth/me — should return authenticated user', async () => {
            if (!app || !accessToken)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('email');
        });
        it('GET /api/v1/auth/me — should reject without token', async () => {
            if (!app)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer()).get('/api/v1/auth/me');
            expect(res.status).toBe(401);
        });
    });
    describe('Project Management', () => {
        it('POST /api/v1/projects — should create project', async () => {
            if (!app || !accessToken)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post('/api/v1/projects')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                name: `E2E Test Project ${Date.now()}`,
                description: '集成测试项目',
            });
            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('id');
            projectId = res.body.data.id;
        });
        it('GET /api/v1/projects — should list projects', async () => {
            if (!app || !accessToken)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/projects')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
    });
    describe('Application Management', () => {
        it('POST /api/v1/projects/:id/applications — should create application', async () => {
            if (!app || !accessToken || !projectId)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/v1/projects/${projectId}/applications`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                applicationTypeCode: 'cnapt2',
                productTypeCode: 'cnprt1',
                productNumber: '2026000001',
            });
            expect(res.status).toBe(201);
            expect(res.body.data).toHaveProperty('applicationNumber');
            expect(res.body.data.applicationNumber).toMatch(/^x\d{9}$/);
            applicationId = res.body.data.id;
        });
    });
    describe('Regulatory Activity', () => {
        it('POST /api/v1/applications/:id/regulatory-activities — should create RA', async () => {
            if (!app || !accessToken || !applicationId)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/v1/applications/${applicationId}/regulatory-activities`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                regulatoryActivityTypeCode: 'cnrat1',
            });
            expect(res.status).toBe(201);
            regulatoryActivityId = res.body.data.id;
        });
    });
    describe('Sequence Management', () => {
        it('POST — should create first sequence (0000)', async () => {
            if (!app || !accessToken || !regulatoryActivityId)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .post(`/api/v1/regulatory-activities/${regulatoryActivityId}/sequences`)
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                sequenceTypeCode: 'cnsqt1',
                description: '首次提交',
                contactName: '张三',
                contactPhone: '010-12345678',
                contactEmail: 'test@example.com',
            });
            expect(res.status).toBe(201);
            expect(res.body.data.sequenceNumber).toBe('0000');
            sequenceId = res.body.data.id;
        });
    });
    describe('Controlled Vocabulary', () => {
        it('GET /api/v1/cv/application-types — should return CV list', async () => {
            if (!app || !accessToken)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/cv/application-types')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data)).toBe(true);
        });
        it('GET /api/v1/cv/product-types — should return product types', async () => {
            if (!app || !accessToken)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/v1/cv/product-types')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(200);
        });
    });
    describe('Health', () => {
        it('GET /health — should return healthy', async () => {
            if (!app)
                return;
            const res = await (0, supertest_1.default)(app.getHttpServer()).get('/health');
            expect(res.status).toBe(200);
        });
    });
});
//# sourceMappingURL=app.e2e-spec.js.map