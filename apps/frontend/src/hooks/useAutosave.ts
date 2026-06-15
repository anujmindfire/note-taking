import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { INoteResponse, SaveStatus } from "@noteapp/shared";

const DEBOUNCE_MS = 2000;
const RETRY_DELAY_MS = 3000;

export function useAutosave(noteId: string, title: string, content: string) {
  const [saveStatus, setSaveStatusState] = useState<SaveStatus>("idle");
  // Mirror saveStatus in a ref so the debounce effect can read it without being listed as a dep
  const saveStatusRef = useRef<SaveStatus>("idle");
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  const lastSavedRef = useRef<{ title: string; content: string } | null>(null);
  const isPendingRef = useRef(false);
  const saveCounterRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAfterSaveRef = useRef(false);
  // Latest title/content for deferred re-saves after in-flight resolves
  const titleRef = useRef(title);
  const contentRef = useRef(content);

  // Keep title/content refs in sync for async callbacks that need the latest values
  titleRef.current = title;
  contentRef.current = content;

  // Stable wrapper that keeps saveStatusRef in sync with state
  const setSaveStatus = useCallback((status: SaveStatus) => {
    saveStatusRef.current = status;
    setSaveStatusState(status);
  }, []);

  const doSave = useCallback(
    async (capturedTitle: string, capturedContent: string) => {
      if (!accessToken) return;
      if (isPendingRef.current) {
        pendingAfterSaveRef.current = true;
        return;
      }
      if (
        lastSavedRef.current &&
        lastSavedRef.current.title === capturedTitle &&
        lastSavedRef.current.content === capturedContent
      ) {
        return;
      }

      const counter = ++saveCounterRef.current;
      isPendingRef.current = true;
      setSaveStatus("saving");

      const attempt = async (): Promise<INoteResponse> => {
        const res = await api.patch<{ data: INoteResponse }>(
          `/notes/${noteId}`,
          { title: capturedTitle, content: capturedContent }
        );
        return res.data.data;
      };

      try {
        const updated = await attempt();
        if (saveCounterRef.current !== counter) return;
        lastSavedRef.current = { title: capturedTitle, content: capturedContent };
        queryClient.setQueryData<INoteResponse>(["note", noteId], updated);
        setSaveStatus("saved");
      } catch {
        if (saveCounterRef.current !== counter) return;
        retryTimerRef.current = setTimeout(async () => {
          try {
            const updated = await attempt();
            if (saveCounterRef.current !== counter) return;
            lastSavedRef.current = { title: capturedTitle, content: capturedContent };
            queryClient.setQueryData<INoteResponse>(["note", noteId], updated);
            setSaveStatus("saved");
          } catch {
            if (saveCounterRef.current === counter) {
              setSaveStatus("error");
            }
          } finally {
            isPendingRef.current = false;
            if (pendingAfterSaveRef.current) {
              pendingAfterSaveRef.current = false;
              void doSave(titleRef.current, contentRef.current);
            }
          }
        }, RETRY_DELAY_MS);
        return;
      }

      isPendingRef.current = false;
      if (pendingAfterSaveRef.current) {
        pendingAfterSaveRef.current = false;
        void doSave(titleRef.current, contentRef.current);
      }
    },
    [accessToken, noteId, queryClient, setSaveStatus]
  );

  useEffect(() => {
    if (lastSavedRef.current === null) return;

    // Clear "Save failed" when user makes a new edit — read via ref to avoid adding
    // saveStatus to deps (which would cause the effect to re-run and reset "error" immediately)
    if (saveStatusRef.current === "error") {
      setSaveStatus("idle");
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void doSave(title, content);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [title, content, doSave, setSaveStatus]);

  const initLastSaved = useCallback(
    (t: string, c: string) => {
      if (lastSavedRef.current === null) {
        lastSavedRef.current = { title: t, content: c };
        setSaveStatus("saved");
      }
    },
    [setSaveStatus]
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return { saveStatus, initLastSaved };
}
