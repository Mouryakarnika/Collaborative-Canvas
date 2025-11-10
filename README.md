# Collaborative Canvas

## Setup

1. Clone repo
2. `npm install`
3. `npm start`
4. Open `http://localhost:3000/` — the app will create a room id in the URL hash. Open the same URL in multiple tabs to test.

## Features
- Brush + Eraser
- Color and stroke width controls
- Real-time drawing via WebSockets (Socket.io)
- Cursor indicators (basic)
- Global undo/redo (operation-level)

## Live Demo
collaborative-canvas-r17drtjmv-mouryas-projects-09c0360c.vercel.app

## How to test
- Open multiple tabs (same machine or different browsers) using the same hash (URL). Draw in one tab; strokes appear in others.
- Press Undo in any client to undo the last global operation.

## Known limitations
- Undo/Redo is operation-level and global; there is no per-user undo stack or selective undo.
- Conflict resolution is naive: operations are applied in server order.
- No authentication; user ids are socket ids.
- Cursor indicators are transient and basic.

## Time spent
Approximately: a few hours to design and implement the prototype.


