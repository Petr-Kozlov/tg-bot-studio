import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { useConnections } from './ConnectionsContext';
import { apiFetch } from '../services/api';

interface ChatModule {
  key: string;
  active: boolean;
  available: boolean;
  enabledForBot: boolean;
}

const ChatWorkspace = createContext<ReturnType<typeof useWorkspace> | null>(null);

function useWorkspace() {
  const match = useMatch('/bots/:botId/chats/:connectionId/:moduleKey?');
  const { botId, connectionId, moduleKey } = match?.params ?? {};
  const { connections, loading: connectionsLoading } = useConnections();
  const connection = connections.find(
    (row) => row.id === connectionId && String(row.botId ?? row.bot_id) === botId,
  );
  const endpoint =
    botId && connectionId ? `/api/bots/${botId}/connections/${connectionId}/modules` : undefined;
  const [state, setState] = useState<{ endpoint: string; modules: ChatModule[]; error: boolean }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    apiFetch<ChatModule[]>(endpoint, { signal: controller.signal })
      .then((modules) => {
        if (!controller.signal.aborted) setState({ endpoint, modules, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ endpoint, modules: [], error: true });
      });
    return () => controller.abort();
  }, [endpoint, revision]);

  const current = state?.endpoint === endpoint ? state : undefined;
  return {
    botId,
    connectionId,
    moduleKey,
    connection,
    connectionsLoading,
    modules: current?.modules,
    error: current?.error,
    refresh,
  };
}

export function ChatWorkspaceProvider({ children }: { children: React.ReactNode }) {
  return <ChatWorkspace.Provider value={useWorkspace()}>{children}</ChatWorkspace.Provider>;
}

export function useChatWorkspace() {
  return useContext(ChatWorkspace)!;
}
