import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export interface OnlineUser {
  userId: string;
  name: string;
  currentPage?: string;
  currentNodeId?: string | null;
}

interface UseCollaborationOptions {
  projectId?: string;
  sequenceId?: string;
  onNodeLocked?: (data: { nodeId: string; userId: string; userName: string }) => void;
  onNodeUnlocked?: (data: { nodeId: string }) => void;
  onNodeUpdated?: (data: { nodeId: string }) => void;
  onNodeApproval?: (data: { nodeId: string; status: string }) => void;
  onNotification?: (data: any) => void;
}

export function useCollaboration(options: UseCollaborationOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io('/ws/collaboration', {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      setConnected(true);

      if (options.projectId) {
        socket.emit('join:project', { projectId: options.projectId });
      }
      if (options.sequenceId) {
        socket.emit('join:sequence', { sequenceId: options.sequenceId });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('user:online', (data: OnlineUser) => {
      setOnlineUsers((prev) => {
        if (prev.find((u) => u.userId === data.userId)) return prev;
        return [...prev, data];
      });
    });

    socket.on('user:offline', (data: { userId: string }) => {
      setOnlineUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    });

    socket.on('user:location', (data: OnlineUser) => {
      setOnlineUsers((prev) =>
        prev.map((u) => (u.userId === data.userId ? { ...u, ...data } : u)),
      );
    });

    if (options.onNodeLocked) socket.on('node:locked', options.onNodeLocked);
    if (options.onNodeUnlocked) socket.on('node:unlocked', options.onNodeUnlocked);
    if (options.onNodeUpdated) socket.on('node:updated', options.onNodeUpdated);
    if (options.onNodeApproval) socket.on('node:approval', options.onNodeApproval);
    if (options.onNotification) socket.on('notification:new', options.onNotification);

    socketRef.current = socket;
  }, [options.projectId, options.sequenceId]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  // Heartbeat every 60 seconds
  useEffect(() => {
    if (!connected || !options.projectId) return;
    const timer = setInterval(() => {
      socketRef.current?.emit('heartbeat', { projectId: options.projectId });
    }, 60000);
    return () => clearInterval(timer);
  }, [connected, options.projectId]);

  const updateLocation = useCallback(
    (currentPage: string, currentNodeId?: string) => {
      if (!socketRef.current || !options.projectId) return;
      socketRef.current.emit('user:location', {
        projectId: options.projectId,
        currentPage,
        currentNodeId,
      });
    },
    [options.projectId],
  );

  return {
    socket: socketRef.current,
    connected,
    onlineUsers,
    updateLocation,
  };
}
