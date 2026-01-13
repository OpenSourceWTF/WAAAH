/**
 * Custom hooks for ExpandedCardView
 * Extracted to reduce component complexity
 */
import { useState, useEffect, useCallback } from 'react';

const DEFAULT_MESSAGES_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 700;
const STORAGE_KEY = 'waaah-messages-width';

/**
 * Hook for managing resizable panel width with drag support
 */
export function useResizableWidth() {
  const [messagesWidth, setMessagesWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved, 10))) : DEFAULT_MESSAGES_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMessagesWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - e.clientX - 20)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem(STORAGE_KEY, String(messagesWidth));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, messagesWidth]);

  const startDragging = useCallback(() => setIsDragging(true), []);

  return { messagesWidth, isDragging, startDragging };
}

/**
 * Hook for managing dropdown/navigator state with outside click handling
 */
export function useDropdownState() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen(prev => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, toggle, close };
}

/**
 * Hook for managing modal state with form field
 */
export function useModalWithField(initialValue = '') {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState(initialValue);

  const open = useCallback(() => setShow(true), []);
  const close = useCallback(() => {
    setShow(false);
    setValue(initialValue);
  }, [initialValue]);

  return { show, value, setValue, open, close };
}
