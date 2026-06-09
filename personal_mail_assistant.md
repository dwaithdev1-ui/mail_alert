# Personal Mail Assistant - Feature Documentation

The **Personal Mail Assistant** is a modern, AI-driven scheduling, communication, and notification assistant built for professionals (modeled for a college principal). It merges natural language capabilities with direct integration into calendar systems, email servers, and user databases.

Here is a detailed breakdown of each core feature of the project:

---

## 1. AI Assistant & Agent Loop
The conversational engine powers both text chat and voice command inputs:
- **Groq & Llama Engine**: Driven by a multi-turn agent loop (`agentLoop.ts`) using the `llama-3.3-70b-versatile` (or `llama-3.1-8b-instant`) model on Groq.
- **Tool-Calling Architecture**: The AI agent is equipped with a suite of schema-defined tools to read from the database, sync with Google Calendar, and send emails via the Gmail API.
- **Contextual Injection**: The agent dynamically receives the current user's profile and the exact list of saved contacts on every turn. This creates a hard ground truth that eliminates address and contact hallucination.
- **Client Response Sanitizer**: A defensive client-side parser (`cleanResponse.ts`) filters out internal reasoning blocks, function calls, or tool echos (like `match_type` and `fuzzy_score` metadata lines), keeping the chat bubble/card conversational and clean.

---

## 2. Speech-to-Text & Text-to-Speech Voice Console
The floating voice console widget provides a hands-free interaction loop:
- **Speech Recognition**: Uses the browser's Web Speech API (`webkitSpeechRecognition`) to transcribe spoken commands into text in real-time.
- **Voice Feedback (TTS)**: Synthesizes conversational agent responses back into professional, spoken answers, alerting the user about scheduled events or confirmations.
- **Pulsing UI Visualizer**: Features an HSL-gradient pulsing orb with visual ripple effects that react dynamically to recording, listening, processing, and speaking states.

---

## 3. Address Book & Fuzzy Contact Resolver
Solves the problem of voice recognition mishearings (e.g. transcribing "Sreedhar" as "Sridhar"):
- **Jaro-Winkler Fuzzy Search**: An in-memory similarity ranker compares search queries against contact lists.
- **Tokenized Email & Name Matching**: The ranker tokenizes strings by spaces, dots, dashes, underscores, and `@` symbols. This allows Jaro-Winkler to match queries against email subcomponents (e.g., matching the query "sridhar" to a contact named `9f.sreedhar.haridasu@gmail.com`).
- **Confidence Gates**:
  - **Exact Match (1.0)**: Proceeds with tool actions automatically.
  - **High-Confidence Fuzzy Match (>= 0.88)**: Matches the email address but informs the user (e.g., *"I matched your voice input to Haridasu Sreedhar..."*).
  - **Ambiguity Gate (< 0.88 or multiple matches)**: Prompts the user with list selections (e.g., *"Voice recognition may have misheard. Did you mean Sreedhar or Sridhar?"*).
- **Server-Side Validation Guard**: Before any email is sent, `send_email` queries the contacts database to verify the recipient. If the address is unrecognized, the action is blocked, and the AI is provided a list of valid contacts to self-correct.

---

## 4. Calendar Management & Google Sync
A responsive planner layout supporting manual calendar interactions and automated agent edits:
- **Google Calendar Integration**: Automatically syncs meetings back and forth with Google Calendar in real-time using Google OAuth tokens.
- **Video Conference Generator**: Generates virtual meetings by requesting Google Meet video links dynamically during Google Calendar event insertion.
- **Rescheduling & Cancellation**: Enables modifying meeting metadata (location, description, start/end dates) or marking them as cancelled.

---

## 5. Conflict Detection Engine
Guards the principal's schedule against double-bookings:
- **Automatic Pre-scheduling Checks**: The database queries overlapping intervals for the same user ID. The agent loop is strictly instructed to run a conflict check (`check_conflicts`) before calling `create_meeting`.
- **Conflict Prevention**: Rejects creating overlapping meetings on the database/server side, returning detailed event conflict listings for the LLM to propose alternative slots.

---

## 6. Email Scanner & Meeting Parser
Extracts scheduling intent from incoming email copy:
- **Gmail Snippet Extraction**: Connects via OAuth to scan the user's recent email inbox messages.
- **LLM Information Extractor**: Feeds raw email bodies to the LLM to parse out details like meeting titles, date/time parameters, locations, virtual links, and agenda details.
- **One-Click Imports**: Displays parsed email cards in a timeline dashboard, allowing users to import scheduling events directly into their database and Google Calendar in a single click.

---

## 7. Daily Briefing summary
A morning orientation digest:
- **Automated Summary**: Generates a daily overview containing calendar workloads, conflict alerts, and notifications.
- **Markdown Renderer**: Formats the overview with bulleted summaries so the principal can digest their agenda rapidly on the dashboard home screen.

---

## 8. Alert Desk & Notification Port
Keeps the user updated on critical events:
- **Dynamic Threshold Alerts**: Fired-event log table storing warnings/logs about approaching meetings based on customizable pre-event thresholds.
- **In-App Notifications**: Stored in a database log table and loaded on the user interface sidebar/notifications hub.
