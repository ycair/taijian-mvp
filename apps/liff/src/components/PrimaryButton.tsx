import type { ButtonHTMLAttributes } from 'react';

export function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        minHeight: 52,
        width: '100%',
        border: 0,
        borderRadius: 16,
        background: props.disabled ? 'var(--line)' : 'var(--primary)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 15,
        ...props.style,
      }}
    />
  );
}
