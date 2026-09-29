import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all origins in dev
        callback(null, true);
      },
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    // Automatically join the public job feed room
    socket.join('job_feed');

    // Join a specific job's room (for chat & job-specific updates)
    socket.on('join:job', (jobId: string) => {
      if (jobId && typeof jobId === 'string') {
        socket.join(`job:${jobId}`);
      }
    });

    // Leave a specific job's room
    socket.on('leave:job', (jobId: string) => {
      if (jobId && typeof jobId === 'string') {
        socket.leave(`job:${jobId}`);
      }
    });

    socket.on('disconnect', () => {
      // client disconnected
    });
  });

  return io;
};

export const getIO = (): SocketIOServer | null => {
  return io;
};

export const broadcastJobCreated = (job: unknown) => {
  if (io) {
    io.to('job_feed').emit('job:created', job);
  }
};

export const broadcastJobAccepted = (data: { jobId: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:accepted', data);
  }
};

export const broadcastJobStatusUpdated = (data: { jobId: string; status: string; job: unknown }) => {
  if (io) {
    io.to('job_feed').emit('job:status_updated', data);
    io.to(`job:${data.jobId}`).emit('job:status_updated', data);
    if (data.status === 'cancelled' || data.status === 'completed') {
      io.to('job_feed').emit('job:accepted', { jobId: data.jobId });
    }
  }
};

export const broadcastJobMessage = (jobId: string, message: unknown) => {
  if (io) {
    io.to(`job:${jobId}`).emit('message:new', message);
  }
};

export const broadcastJobRatingSubmitted = (data: { jobId: string; rating: unknown; ratee: unknown }) => {
  if (io) {
    io.to(`job:${data.jobId}`).emit('job:rated', data);
    io.to('job_feed').emit('job:rated', data);
  }
};


