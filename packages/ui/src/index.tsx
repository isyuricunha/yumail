import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes
} from "react";

type Size = "sm" | "md" | "lg";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx("ym-button", `ym-button--${variant}`, `ym-button--${size}`, className)}
      {...props}
    />
  )
);

Button.displayName = "Button";

export interface IconButtonProps extends ButtonProps {
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, label, size = "md", children, ...props }, ref) => (
    <Button
      ref={ref}
      className={cx("ym-icon-button", className)}
      size={size}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  )
);

IconButton.displayName = "IconButton";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "panel" | "elevated" | "sunken";
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, tone = "panel", ...props }, ref) => (
    <div ref={ref} className={cx("ym-surface", `ym-surface--${tone}`, className)} {...props} />
  )
);

Surface.displayName = "Surface";

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "h1" | "h2" | "h3" | "label";
  variant?: "title" | "heading" | "body" | "small" | "caption";
  muted?: boolean;
  children: ReactNode;
}

export function Typography({
  as: Element = "p",
  className,
  variant = "body",
  muted = false,
  ...props
}: TypographyProps) {
  return (
    <Element
      className={cx("ym-typography", `ym-typography--${variant}`, muted && "ym-muted", className)}
      {...props}
    />
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cx("ym-input", invalid && "ym-field--invalid", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);

Input.displayName = "Input";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cx("ym-textarea", invalid && "ym-field--invalid", className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "accent" | "success" | "warning";
}

export function Tag({ className, tone = "neutral", ...props }: TagProps) {
  return <span className={cx("ym-tag", `ym-tag--${tone}`, className)} {...props} />;
}

export const Chip = Tag;

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string;
  height?: string;
}

export function Skeleton({ className, width, height, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cx("ym-skeleton", className)}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  );
}
