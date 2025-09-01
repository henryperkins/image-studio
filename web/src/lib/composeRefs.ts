import * as React from 'react';

// Assigns a value to a React ref without side-effects.
export function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
  } else {
    // MutableRefObject
    ;(ref as React.MutableRefObject<T | null>).current = value;
  }
}

// Returns a stable ref callback that forwards the node to all provided refs.
// The identity stays stable as long as the refs themselves don't change.
export function useComposedRef<T>(
  ...refs: Array<React.Ref<T> | undefined>
) {
  // Use dynamic dependency list so identity is stable unless a ref changes
  return React.useMemo(
    () =>
      (node: T | null) => {
        for (const ref of refs) setRef(ref, node);
      },
    // React compares dependency elements, not the array instance
    refs
  );
}

