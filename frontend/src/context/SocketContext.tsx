import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState<boolean>(false);

  // Reconnect whenever the signed-in user changes: the server identifies the socket
  // from the session cookie sent during the handshake.
  useEffect(() => {
    if (authLoading) return;

    // Connect through the Vite proxy or origin. Keep retrying indefinitely (with backoff)
    // so realtime updates recover on their own after a backend restart or deploy.
    const socketInstance = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketInstance.on('connect', () => {
      console.log('⚡ Connected to Plugy Realtime Socket.IO server', socketInstance.id);
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('🔌 Disconnected from Plugy Realtime server');
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setConnected(false);
    };
  }, [userId, authLoading]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextType => {
  return useContext(SocketContext);
};
