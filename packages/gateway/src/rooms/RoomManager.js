import { createRoom } from './Room.js';

export function createRoomManager() {
  const rooms = new Map();

  return {
    getOrCreateRoom(sessionId) {
      if (!rooms.has(sessionId)) {
        rooms.set(sessionId, createRoom(sessionId));
      }
      return rooms.get(sessionId);
    },

    getRoom(sessionId) {
      return rooms.get(sessionId) ?? null;
    },

    removeRoom(sessionId) {
      return rooms.delete(sessionId);
    },

    listRoomIds() {
      return Array.from(rooms.keys());
    },
  };
}
