"use client";

import { useEffect, useRef } from 'react';
import { getSupabaseEnv } from '@/lib/supabase';

export type RealtimeTable =
  | 'products'
  | 'purchases'
  | 'self_service_reservations'
  | 'cashboxSessions'
  | 'returns'
  | 'auditLogs'
  | 'users'
  | 'bingo_registrations'
  | 'bingo_landing_views'
  | 'bingo_landing_content';

type RealtimeStatus = 'connected' | 'fallback' | 'disconnected';

type UseSupabaseRealtimeOptions = {
  tables: readonly RealtimeTable[];
  onChange: () => void | Promise<void>;
  fallbackIntervalMs?: number;
  debounceMs?: number;
  enabled?: boolean;
  onStatusChange?: (status: RealtimeStatus) => void;
};

const HEARTBEAT_INTERVAL_MS = 25_000;
const JOIN_TIMEOUT_MS = 5_000;
const DEFAULT_FALLBACK_INTERVAL_MS = 10_000;
const DEFAULT_DEBOUNCE_MS = 250;

function buildRealtimeUrl() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  const realtimeUrl = supabaseUrl
    .replace(/^http:/, 'ws:')
    .replace(/^https:/, 'wss:')
    .replace(/\/$/, '');

  return `${realtimeUrl}/realtime/v1/websocket?apikey=${encodeURIComponent(supabaseAnonKey)}&vsn=1.0.0`;
}

function buildJoinPayload(tables: readonly RealtimeTable[]) {
  const { supabaseAnonKey } = getSupabaseEnv();

  return {
    config: {
      broadcast: { self: false },
      presence: { key: '' },
      postgres_changes: [{
        event: 'INSERT',
        schema: 'public',
        table: 'app_realtime_events',
        filter: `topic=in.(${tables.join(',')})`,
      }],
    },
    access_token: supabaseAnonKey,
  };
}

export function useSupabaseRealtime({
  tables,
  onChange,
  fallbackIntervalMs = DEFAULT_FALLBACK_INTERVAL_MS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enabled = true,
  onStatusChange,
}: UseSupabaseRealtimeOptions) {
  const onChangeRef = useRef(onChange);
  const onStatusChangeRef = useRef(onStatusChange);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!enabled || tables.length === 0 || typeof window === 'undefined') {
      return undefined;
    }

    let socket: WebSocket | null = null;
    let heartbeatInterval: number | null = null;
    let fallbackInterval: number | null = null;
    let reconnectTimer: number | null = null;
    let joinTimer: number | null = null;
    let joinRef: string | null = null;
    let ref = 1;
    let isDisposed = false;
    let hasRealtimeConnected = false;

    const scheduleChange = () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }

      debounceRef.current = window.setTimeout(() => {
        void onChangeRef.current();
      }, debounceMs);
    };

    const setStatus = (status: RealtimeStatus) => {
      onStatusChangeRef.current?.(status);
    };

    const startFallback = () => {
      if (fallbackInterval) return;
      setStatus('fallback');
      fallbackInterval = window.setInterval(() => {
        void onChangeRef.current();
      }, fallbackIntervalMs);
    };

    const stopFallback = () => {
      if (!fallbackInterval) return;
      window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    };

    const send = (topic: string, event: string, payload: unknown) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) return null;
      const messageRef = String(ref++);
      socket.send(JSON.stringify({ topic, event, payload, ref: messageRef }));
      return messageRef;
    };

    const connect = () => {
      if (isDisposed) return;

      try {
        socket = new WebSocket(buildRealtimeUrl());
      } catch (error) {
        console.warn('No se pudo abrir Supabase Realtime. Se usará actualización automática periódica.', error);
        startFallback();
        reconnectTimer = window.setTimeout(connect, fallbackIntervalMs);
        return;
      }

      socket.onopen = () => {
        joinRef = send('realtime:public:platform-events', 'phx_join', buildJoinPayload(tables));
        joinTimer = window.setTimeout(() => {
          if (!hasRealtimeConnected) startFallback();
        }, JOIN_TIMEOUT_MS);
        heartbeatInterval = window.setInterval(() => {
          send('phoenix', 'heartbeat', {});
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        let message: { event?: string; payload?: unknown; ref?: string } | null = null;

        try {
          message = JSON.parse(event.data) as { event?: string; payload?: unknown; ref?: string };
        } catch {
          return;
        }

        if (message.event === 'phx_reply' && message.ref === joinRef) {
          const payload = message.payload as { status?: string } | undefined;
          if (payload?.status === 'ok') {
            hasRealtimeConnected = true;
            if (joinTimer) window.clearTimeout(joinTimer);
            joinTimer = null;
            stopFallback();
            setStatus('connected');
          } else {
            startFallback();
          }
          return;
        }

        if (message.event === 'postgres_changes') {
          scheduleChange();
        }
      };

      socket.onerror = () => {
        startFallback();
      };

      socket.onclose = () => {
        hasRealtimeConnected = false;
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        if (joinTimer) window.clearTimeout(joinTimer);
        heartbeatInterval = null;
        joinTimer = null;

        if (isDisposed) {
          setStatus('disconnected');
          return;
        }

        setStatus('disconnected');
        startFallback();
        reconnectTimer = window.setTimeout(connect, fallbackIntervalMs);
      };
    };

    startFallback();
    connect();

    return () => {
      isDisposed = true;

      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (heartbeatInterval) window.clearInterval(heartbeatInterval);
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (joinTimer) window.clearTimeout(joinTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        send('realtime:public:platform-events', 'phx_leave', {});
      }
      socket?.close();
    };
  }, [debounceMs, enabled, fallbackIntervalMs, tables]);
}