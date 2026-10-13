import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

/**
 * Keeps this connection in a job's private room (chat, status, live location) while `enabled`.
 * Re-joins after every reconnect, because the server forgets room membership when a connection drops.
 */
export const useJobRoom = (jobId: string | null, enabled: boolean) => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !jobId || !enabled) return;

    const join = () => socket.emit('join:job', jobId);
    if (socket.connected) join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      socket.emit('leave:job', jobId);
    };
  }, [socket, jobId, enabled]);
};
