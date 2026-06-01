import pool, { schemaName } from './db';
import bcrypt from 'bcryptjs';

async function initDb() {
  console.log('Initializing database...');
  console.log(`Connecting with schema: ${schemaName}`);

  const client = await pool.connect();
  try {
    // 1. Create Schema if it doesn't exist
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`Schema "${schemaName}" verified/created.`);

    // 2. Create Users Table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${schemaName}.users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createTableQuery);
    console.log('Table "users" verified/created.');

    // 3. Seed Default User (principal@gmail.com / 123456) if not exists
    const defaultEmail = 'principal@gmail.com';
    const checkUser = await client.query(
      `SELECT id FROM ${schemaName}.users WHERE username = $1`,
      [defaultEmail]
    );

    if (checkUser.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await client.query(
        `INSERT INTO ${schemaName}.users (full_name, username, password) VALUES ($1, $2, $3)`,
        ['Principal User', defaultEmail, hashedPassword]
      );
      console.log(`Default user "${defaultEmail}" created with password "123456".`);
    } else {
      console.log(`Default user "${defaultEmail}" already exists.`);
    }

    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

initDb().catch(console.error);
