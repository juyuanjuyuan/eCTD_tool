import { useCallback, useEffect, useRef } from 'react';
import { documentApi } from '../services/document';
import { useEditorStore } from '../stores/useEditorStore';

export const useAutoSave = (nodeId: string | null) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ contentJson: any; contentHtml: string } | null>(null);
  const savingRef = useRef(false);
  const { setDirty, setSaveStatus } = useEditorStore();

  const doSave = useCallback(async () => {
    if (!nodeId || !pendingRef.current || savingRef.current) return;

    savingRef.current = true;
    setSaveStatus('saving');

    try {
      await documentApi.save(nodeId, pendingRef.current);
      pendingRef.current = null;
      setDirty(false);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [nodeId, setDirty, setSaveStatus]);

  const debouncedSave = useCallback(
    (contentJson: any, contentHtml: string) => {
      pendingRef.current = { contentJson, contentHtml };
      setDirty(true);
      setSaveStatus('unsaved');

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doSave, 3000);
    },
    [doSave, setDirty, setSaveStatus],
  );

  // Flush pending save immediately (for manual save / node switch)
  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await doSave();
  }, [doSave]);

  // Warn before page close if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup timer on unmount
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { debouncedSave, flushSave };
};
