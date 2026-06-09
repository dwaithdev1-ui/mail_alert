"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schemaName = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load .env from the root directory
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
const pool = new pg_1.Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    // AWS RDS and modern environments may require SSL. We'll set it optionally or default to rejectUnauthorized: false if on AWS
    ssl: process.env.DB_HOST && process.env.DB_HOST.includes('amazonaws.com')
        ? { rejectUnauthorized: false }
        : undefined
});
exports.default = pool;
exports.schemaName = process.env.DB_SCHEMA || 'personal_agent';
