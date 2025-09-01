import * as React from 'react';

type PossibleCleanup = void | (() => void)

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') return (ref as (value: T | null) => PossibleCleanup)(value)
  ;(ref as React.MutableRefObject<T | null>).current = value;
}

export function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  // Keep cleanup functions per function-ref identity
  const cleanups = new Map<React.RefCallback<T>, () => void>();
  let scheduled = false;
  let lastNode: T | null = null;
  let prevNode: T | null = null; // track last applied node for function refs

  const callFns = (node: T | null) => {
    // Assign object refs synchronously
    for (const ref of refs) {
      if (ref && typeof ref !== 'function') (ref as React.MutableRefObject<T | null>).current = node;
    }

    // Defer function refs to post-commit microtask
    if (!scheduled) {
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;

        // Use the latest node at the time the microtask runs
        const current = lastNode;

        // Skip if nothing changed since the last run
        if (current === prevNode) return;

        for (const ref of refs) {
          if (typeof ref === 'function') {
            const refFn = ref as React.RefCallback<T>;

            // Run previous cleanup (if any) before re-invoking
            const prev = cleanups.get(refFn);
            if (prev) {
              prev();
              cleanups.delete(refFn);
            }

            const maybeCleanup = assignRef(ref, current);
            if (typeof maybeCleanup === 'function') {
              cleanups.set(refFn, maybeCleanup);
            }
          }
        }

        prevNode = current;
      });
    }
  };

  return (node: T | null) => {
    // Ignore redundant calls with same node
    if (lastNode === node) return;
    lastNode = node;
    callFns(node);
  };
}

export function useComposedRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  // Stable identity unless the actual refs change
  return React.useCallback(composeRefs<T>(...refs), refs);
}

