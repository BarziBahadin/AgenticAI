# Chat Portal (Read Only)

## Setup
1) Copy env:
   cp .env.example .env

2) Edit `.env`:
   - DB_PASSWORD (paste locally)
   - DB_NAME (your database name)

3) Run:
   npm install
   npm run dev

Open:
http://localhost:3000

## Optional: show agent names
If your `chat_messages` table contains a column that stores operator id (matching `base_operators.id`),
set in `.env`:
CHAT_AGENT_ID_COLUMN="operator_id"
