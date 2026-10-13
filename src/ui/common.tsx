import { AnimatePresence, motion } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { audio } from '../audio/audio';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-sky-400 to-blue-600 text-white shadow-[0_8px_24px_-8px_rgb(56_132_255/0.8)] hover:from-sky-300 hover:to-blue-500',
  secondary: 'bg-white/10 text-white hover:bg-white/16 border border-white/12',
  ghost: 'bg-transparent text-white/80 hover:text-white hover:bg-white/8',
  danger: 'bg-gradient-to-b from-rose-400 to-rose-600 text-white shadow-[0_8px_24px_-8px_rgb(244_63_94/0.7)]',
  success: 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_8px_24px_-8px_rgb(16_185_129/0.7)]',
  warning: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-[0_8px_24px_-8px_rgb(245_158_11/0.7)]',
};

export function Button({
  children,
  onClick,
  variant = 'secondary',
  className,
  disabled,
  size = 'md',
  title,
  testId,
  sound = 'tap',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  testId?: string;
  sound?: 'tap' | 'select' | 'confirm' | 'open' | 'close' | null;
  type?: 'button' | 'submit';
}) {
  const sizes = {
    sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
    md: 'h-11 px-4 text-[0.95rem] rounded-2xl gap-2',
    lg: 'h-13 px-5 text-base rounded-2xl gap-2',
    xl: 'h-16 px-7 text-lg rounded-3xl gap-3',
  }[size];
  return (
    <motion.button
      type={type}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      title={title}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        if (sound) audio.play(sound);
        onClick?.();
      }}
      className={cx(
        'inline-flex select-none items-center justify-center font-semibold tracking-tight transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        sizes,
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function IconButton({
  children,
  onClick,
  label,
  active,
  className,
  testId,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
  active?: boolean;
  className?: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      aria-label={label}
      title={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => {
        audio.play('tap');
        onClick?.();
      }}
      className={cx(
        'inline-flex h-10 min-w-10 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-white/12 hover:text-white disabled:opacity-40',
        active && 'bg-white/16 text-white',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
  icon,
  testId,
  footer,
  dismissable = true,
}: {
  open: boolean;
  onClose?: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  icon?: string;
  testId?: string;
  footer?: ReactNode;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open || !dismissable) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [open, onClose, dismissable]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-ink-950/55 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget && dismissable) onClose?.();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            data-testid={testId}
            className={cx(
              'glass relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]',
              wide ? 'sm:max-w-5xl' : 'sm:max-w-lg',
            )}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <div className="flex items-start gap-3 border-b border-white/8 px-5 pb-4 pt-5 sm:px-6">
              {icon && <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-2xl">{icon}</div>}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h2>
                {subtitle && <p className="mt-0.5 text-sm text-white/60">{subtitle}</p>}
              </div>
              {dismissable && (
                <IconButton label="Close" onClick={onClose} testId="modal-close">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </IconButton>
              )}
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 sm:px-6">{children}</div>
            {footer && <div className="safe-bottom border-t border-white/8 px-5 py-3 sm:px-6">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Meter({ value, color, className, label }: { value: number; color: string; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cx('relative h-2.5 overflow-hidden rounded-full bg-white/10', className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: color }} initial={false} animate={{ width: `${v * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      <div className="btn-shine absolute inset-0 animate-shine opacity-40" />
    </div>
  );
}

export function Pill({ children, color = 'bg-white/10 text-white/80', className }: { children: ReactNode; color?: string; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide', color, className)}>{children}</span>;
}

export function Coin({ className }: { className?: string }) {
  return (
    <span className={cx('inline-grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-[0.62rem] font-black text-amber-900 shadow-inner', className)} aria-hidden>
      ¢
    </span>
  );
}

export function Stars({ n, max = 3, size = 'text-2xl' }: { n: number; max?: number; size?: string }) {
  return (
    <span className={cx('inline-flex gap-1', size)} aria-label={`${n} of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <motion.span key={i} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.25 + i * 0.18, type: 'spring', stiffness: 300, damping: 12 }} className={i < n ? '' : 'opacity-25 grayscale'}>
          ⭐
        </motion.span>
      ))}
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-1 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white/45">{children}</h3>;
}

export function Toggle({ checked, onChange, label, desc, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl px-1 py-2.5">
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        {desc && <span className="block text-sm text-white/55">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => {
          audio.play('tap');
          onChange(!checked);
        }}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-emerald-500' : 'bg-white/15')}
      >
        <motion.span className="absolute top-1 h-5 w-5 rounded-full bg-white shadow" animate={{ left: checked ? 24 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
      </button>
    </label>
  );
}

export function Slider({ value, onChange, label, min = 0, max = 1, step = 0.05, format }: { value: number; onChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  return (
    <label className="block py-2">
      <span className="mb-1.5 flex items-center justify-between text-sm font-semibold">
        <span>{label}</span>
        <span className="font-mono text-white/60">{format ? format(value) : `${Math.round(value * 100)}%`}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-sky-400" />
    </label>
  );
}
