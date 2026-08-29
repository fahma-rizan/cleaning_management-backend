const { Server } = require('socket.io');

let io;

// Track which socket IDs belong to which userId so we can send
// targeted notifications to a specific user.
const userSockets = new Map(); // userId -> Set of socketIds

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3006'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Client should emit 'register' with their userId right after connecting
    // so we can map the socket to their account for targeted notifications.
    // Example client code:  socket.emit('register', userId);
    socket.on('register', (userId) => {
      if (!userId) return;
      socket.join(`user:${userId}`); // Join a private room keyed by userId

      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId).add(socket.id);
      console.log(`Socket ${socket.id} registered to user ${userId}`);
    });

    // Admin clients emit 'joinAdminRoom' to receive payment-update events
    socket.on('joinAdminRoom', () => {
      socket.join('admin-room');
      console.log(`Socket ${socket.id} joined admin-room`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      // Clean up the userSockets map
      userSockets.forEach((socketSet, userId) => {
        if (socketSet.has(socket.id)) {
          socketSet.delete(socket.id);
          if (socketSet.size === 0) userSockets.delete(userId);
        }
      });
    });
  });

  return io;
}

/**
 * Emits an event to ALL connected clients (broadcast).
 * @param {string} eventName
 * @param {any} data
 */
function emitEvent(eventName, data) {
  if (io) {
    io.emit(eventName, data);
  } else {
    console.error('Socket.IO not initialized. Cannot emit event.');
  }
}

/**
 * FIX: New function — emits an event to a specific user's private room.
 * Previously the invoiceController called emitEvent(userId, eventName, data)
 * with 3 arguments, but emitEvent only accepts 2 — so notifications were
 * silently dropped. This function sends to the room 'user:{userId}'.
 *
 * @param {string} userId  - The target user's ID
 * @param {string} eventName
 * @param {any} data
 */
function emitToUser(userId, eventName, data) {
  if (!io) {
    console.error('Socket.IO not initialized. Cannot emit to user.');
    return;
  }
  if (!userId) {
    console.warn('emitToUser called with no userId — skipping.');
    return;
  }
  io.to(`user:${userId}`).emit(eventName, data);
}

module.exports = {
  initSocket,
  emitEvent,
  emitToUser, // Export the new function
};