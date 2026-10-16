import { Server } from 'socket.io';

let ioInstance = null;

export const initSocketIO = (httpServer, clientOrigin) => {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: [clientOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  ioInstance.on('connection', (socket) => {
    // Join a specific show's real-time seat room
    socket.on('join_show', (showId) => {
      if (showId) {
        socket.join(`show_${showId}`);
      }
    });

    socket.on('leave_show', (showId) => {
      if (showId) {
        socket.leave(`show_${showId}`);
      }
    });

    socket.on('disconnect', () => {
      // Socket disconnected
    });
  });

  return ioInstance;
};

export const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.IO is not initialized yet.');
  }
  return ioInstance;
};

// Broadcast seat status update to all clients looking at a show
export const broadcastSeatUpdate = (showId, seatsData) => {
  if (ioInstance) {
    ioInstance.to(`show_${showId}`).emit('seats_updated', seatsData);
  }
};
