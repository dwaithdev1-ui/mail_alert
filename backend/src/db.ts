import { Pool } from 'pg';
import dotenv from 'dotenv';
  }
});

// SSL configuration remains unchanged

export default pool;
export const schemaName = process.env.DB_SCHEMA || 'personal_agent';
