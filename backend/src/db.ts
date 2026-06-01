import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
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

export default pool;
export const schemaName = process.env.DB_SCHEMA || 'personal_agent';
