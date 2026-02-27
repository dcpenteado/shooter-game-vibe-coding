import { GameRoom } from './GameRoom.js';

export class RoomManager {
  constructor(mapData, charDef, weaponDefs) {
    this.rooms = new Map(); // roomId -> GameRoom
    this.mapData = mapData;
    this.charDef = charDef;
    this.weaponDefs = weaponDefs;
  }

  createRoom(roomName) {
    const id = Math.random().toString(16).slice(2, 10);
    const room = new GameRoom(id, roomName, this.mapData, this.charDef, this.weaponDefs, this);
    room.start();
    this.rooms.set(id, room);
    console.log(`Room "${roomName}" (${id}) created. Total rooms: ${this.rooms.size}`);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  removeRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.stop();
    this.rooms.delete(roomId);
    console.log(`Room "${room.name}" (${roomId}) closed. Total rooms: ${this.rooms.size}`);
  }

  onRoomEmpty(roomId) {
    this.removeRoom(roomId);
  }

  getRoomList() {
    return [...this.rooms.values()].map(r => ({
      id: r.id,
      name: r.name,
      players: r.sessions.size,
      maxPlayers: r.maxPlayers,
    }));
  }
}
