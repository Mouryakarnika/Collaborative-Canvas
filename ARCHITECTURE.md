# ARCHITECTURE

## Data flow
- Client captures pointer events → creates `stroke` operation (id, points, color, width, tool).
- Client sends `start-stroke`, repeated `stroke-points`, and `end-stroke` to server.
- Server appends to global history and broadcasts `remote-*` events to all clients in the room.
- Clients render incoming ops in the order received.

## WebSocket protocol
- `join-room` { roomId }
- `history` { history }
- `start-stroke` { stroke }
- `remote-start-stroke` { stroke }
- `stroke-points` { strokeId, points }
- `remote-stroke-points` { strokeId, points }
- `end-stroke` { stroke }
- `remote-end-stroke` { stroke }
- `undo` → server responds with `op-undo` { opId }
- `redo` → server responds with `op-redo` { op }
- `cursor` → `cursor-update` { userId, x, y, color }
- `users` { users }
- `me` { userId }

## Undo/Redo strategy
- Server maintains `history` (array of ops) and `undone` stack.
- Undo pops the last operation and broadcasts `op-undo` with op id. Redo pushes back last undone op and broadcasts `op-redo` with full op.
- This is a simple CRDT-like linear history approach: all clients agree on server order and undo affects the most recent operation globally.

## Performance decisions
- Operations are batched: clients send `stroke-points` in small batches (6 points) to limit network overhead while keeping low-latency updates.
- Canvas redraw only replays operations from the history array.
- Device pixel ratio is respected when resizing.

## Conflict resolution
- Server is authoritative: operations are accepted in the order received.
- Because every stroke is an atomic operation, overlapping strokes are rendered in the order they reached the server.

## Extensions
- To support per-user undo or selective undo we'd track tombstones & operation metadata, or implement an OT/CRDT system.
- To scale we would shard rooms across processes and persist history in a datastore (Redis) and use a message broker for broadcast.