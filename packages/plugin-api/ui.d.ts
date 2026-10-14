/**
 * The app's own components, for plugin UIs that look and behave like the rest of Betelgeuse.
 * Provided by the app at run time.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export declare function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "default" | "ghost" | "danger"; icon?: ReactNode },
): ReactNode;

export declare function Switch(props: { checked: boolean; onChange: (checked: boolean) => void; label: string }): ReactNode;

export declare function TextInput(props: InputHTMLAttributes<HTMLInputElement>): ReactNode;

/** A settings row: a label and hint on the left, a control on the right. */
export declare function SettingRow(props: { label: string; hint?: ReactNode; children: ReactNode }): ReactNode;

/** A floating panel anchored to an element or point; closes on outside click and Escape. */
export declare function Popover(props: {
  anchor: HTMLElement | DOMRect | null;
  onClose: () => void;
  placement?: "bottom-start" | "bottom-end" | "right-start";
  className?: string;
  children: ReactNode;
}): ReactNode;

export declare function MenuItem(props: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
}): ReactNode;

export declare function MenuDivider(): ReactNode;

/** An empty-state message for views. */
export declare function EmptyState(props: { icon?: ReactNode; title: string; children?: ReactNode }): ReactNode;
