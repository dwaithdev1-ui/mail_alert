# Mail Alert & Scheduling AI Assistant

An intelligent, AI-powered meeting scheduler and email notification assistant designed to help college principals manage their schedule, conflicts, daily briefings, and contact book efficiently. The assistant includes a voice command interface that matches user input to saved contacts using fuzzy matching.

---

## Project Structure

The project is structured as a monorepo consisting of:
- **`backend`**: Node.js Express server written in TypeScript using PostgreSQL for storage and the Groq API (Llama 3) for the AI agent loop.
- **`frontend`**: React web application built with TypeScript, Vite, and CSS.

---

## Prerequisites

Before setting up the project, ensure you have the following installed:
- **Node.js** (v18 or higher recommended)
- **NPM** (v9 or higher)
- **PostgreSQL** database (running locally or hosted)

---

## Getting Started

### 1. Database Setup

Ensure PostgreSQL is running and create a database named `mail_alert` (or whichever name you prefer).

---

### 2. Backend Configuration & Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install the backend dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the `backend/` directory and populate it with the following environment variables:
   ```env
   PORT=5000
   DB_HOST=your-db-host
   DB_PORT=5432
   DB_NAME=mail_alert
   DB_USER=your-db-username
   DB_PASSWORD=your-db-password
   DB_SCHEMA=personal_agent
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL=llama-3.1-8b-instant
   ```

4. Initialize the database schema and seed the initial user and mock contacts:
   ```bash
   npm run init-db
   ```
   *Note: This creates all 11 required tables and seeds a default user (`principal@gmail.com` / password: `123456`) and some mock contacts.*

5. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend server will run on `http://localhost:5000`.

---

### 3. Frontend Configuration & Setup

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```

2. Install the frontend dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the `frontend/` directory and provide your Google Client ID (for calendar/email sync functionality):
   ```env
   VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   VITE_API_URL=http://localhost:5000
   ```

4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The React application will run on `http://localhost:5173`.

---

## Features

1. **Dashboard**: Overall summary of your day, quick stats, and notifications.
2. **AI Voice Assistant**: Voice/text interface that lets you ask to schedule meetings, check conflicts, generate briefings, or send emails.
3. **Fuzzy Contact Resolution**: Voice input names are matched phonetically/spelling-tolerantly (Jaro-Winkler) against the Address Book.
4. **Calendar Page**: Visualize scheduled meetings, create new meetings, and detect conflicting time slots.
5. **Meeting Scanner**: Scan Gmail inbox for meeting requests and automatically import them.
6. **Departments Management**: View and edit department HOD contacts and details.
7. **Address Book**: Add, search, and delete saved contacts.
