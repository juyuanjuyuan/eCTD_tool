"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseJsonField = parseJsonField;
exports.serializeJsonField = serializeJsonField;
function parseJsonField(raw, fallback) {
    if (raw === null || raw === undefined) {
        return fallback;
    }
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return fallback;
        }
    }
    return raw;
}
function serializeJsonField(value) {
    if (process.env.DB_PROVIDER === 'sqlite') {
        return JSON.stringify(value);
    }
    return value;
}
//# sourceMappingURL=json-field.helper.js.map