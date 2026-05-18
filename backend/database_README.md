# Database Schema

Database file: backend/database.db

## user
- user_id INTEGER PRIMARY KEY; range 0..63
- user_name TEXT NOT NULL; length <= 16
- user_password TEXT NOT NULL; length <= 32
- user_token TEXT NOT NULL; length 32
- token_time TEXT NOT NULL; timestamp string

## conversation
- conversation_id INTEGER PRIMARY KEY; range 0..4095
- user_id INTEGER NOT NULL; references user(user_id)
- last_edit_time TEXT NOT NULL; timestamp string
- title TEXT NOT NULL; length <= 32
- model TEXT NOT NULL; length <= 32
- prompt TEXT NOT NULL; long text

## message
- message_id INTEGER PRIMARY KEY; range 0..8388607
- conversation_id INTEGER NOT NULL; references conversation(conversation_id)
- time TEXT NOT NULL; timestamp string
- roll TEXT NOT NULL; one of {user, llm}
- context TEXT NOT NULL; long text

## files
- files_id INTEGER PRIMARY KEY; range 0..1048575
- message_id INTEGER NOT NULL; references message(message_id)
- time TEXT NOT NULL; timestamp string
- file_name TEXT NOT NULL
- file_hash TEXT NOT NULL; from FileHash(message_id, file_name)

## indexes
- idx_user_token UNIQUE on user(user_token)
