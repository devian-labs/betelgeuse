import { lazy, Suspense, type ComponentProps } from "react";

/** The icon picker carries every icon and emoji; it loads the first time someone opens it. */
const Picker = lazy(() => import("./IconPicker").then((m) => ({ default: m.IconPicker })));

export function IconPicker(props: ComponentProps<typeof Picker>) {
  return (
    <Suspense fallback={null}>
      <Picker {...props} />
    </Suspense>
  );
}
