import React from 'react';

type HeadingLevel = 1|2|3|4|5|6;

interface BaseProps {
  className?: string;
  children: React.ReactNode;
  tone?: 'default' | 'muted' | 'danger' | 'success' | 'warning';
  id?: string;
}

const toneMap: Record<NonNullable<BaseProps['tone']>, string> = {
  default: 'text-white',
  muted: 'text-neutral-400',
  danger: 'text-red-400',
  success: 'text-green-400',
  warning: 'text-yellow-400',
};

interface HeadingProps extends BaseProps {
  level?: HeadingLevel;
  serif?: boolean; // use display serif style for large headings
  weight?: 'regular'|'medium'|'semibold'|'bold';
  clamp?: number; // line clamp
}

const weightMap = {
  regular: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const Heading: React.FC<HeadingProps> = ({
  level = 2,
  serif = level <= 2,
  weight = level <= 3 ? 'semibold' : 'medium',
  clamp,
  tone = 'default',
  className,
  children,
  ...rest
}) => {
  const Tag = (`h${level}` as keyof JSX.IntrinsicElements);
  const sizeClass = {
    1: 'text-4xl',
    2: 'text-3xl',
    3: 'text-2xl',
    4: 'text-xl',
    5: 'text-lg',
    6: 'text-md'
  }[level];
  const clampClass = clamp ? 'truncate-2' : '';
  return (
    <Tag
      className={clsx(
        sizeClass,
        serif ? 'display-serif' : 'font-ui',
        weightMap[weight],
        clampClass,
        toneMap[tone],
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
};

interface TextProps extends BaseProps {
  size?: 'xs'|'sm'|'base'|'md'|'lg';
  longform?: boolean;
  mono?: boolean;
  numeric?: boolean;
  weight?: 'regular'|'medium'|'semibold'|'bold';
  as?: keyof JSX.IntrinsicElements;
  truncate?: 1|2;
}

export const Text: React.FC<TextProps> = ({
  size = 'base',
  longform = false,
  mono = false,
  numeric = false,
  weight = 'regular',
  tone = 'default',
  truncate,
  as = 'p',
  className,
  children,
  ...rest
}) => {
  const Tag = as as keyof JSX.IntrinsicElements;
  const sizeClass = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    md: 'text-md',
    lg: 'text-lg'
  }[size];
  return (
    <Tag
      className={clsx(
        sizeClass,
        longform ? 'font-longform' : 'font-ui',
        mono && 'font-mono',
        numeric && 'font-numeric',
        weightMap[weight],
        toneMap[tone],
        truncate === 1 && 'truncate',
        truncate === 2 && 'truncate-2',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
};

interface LabelProps extends BaseProps {
  htmlFor?: string;
  required?: boolean;
  size?: 'sm'|'xs';
  uppercase?: boolean;
}

export const Label: React.FC<LabelProps> = ({
  htmlFor,
  required,
  size='sm',
  uppercase=true,
  tone='muted',
  className,
  children
}) => {
  return (
    <label
      htmlFor={htmlFor}
      className={clsx(
        size === 'xs' ? 'text-xs' : 'text-sm',
        'font-medium',
        uppercase && 'small-caps',
        toneMap[tone],
        className
      )}
    >
      {children}{required && <span aria-hidden className="text-red-400 ml-1">*</span>}
    </label>
  );
};

interface MonoProps extends BaseProps {
  wrap?: boolean;
}

export const Mono: React.FC<MonoProps> = ({ wrap=false, tone='default', className, children }) => (
  <code
    className={clsx(
      'font-mono text-sm',
      !wrap && 'whitespace-nowrap',
      toneMap[tone],
      className
    )}
  >
    {children}
  </code>
);

interface NumericProps extends BaseProps {
  align?: 'start'|'end'|'center';
  size?: 'sm'|'base'|'md'|'lg';
  mono?: boolean; // override to monospaced
}

export const Numeric: React.FC<NumericProps> = ({
  align='end',
  size='base',
  mono=false,
  tone='default',
  className,
  children
}) => {
  const sizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    md: 'text-md',
    lg: 'text-lg'
  }[size];
  return (
    <span
      className={clsx(
        sizeClass,
        'font-numeric',
        mono && 'font-mono',
        toneMap[tone],
        align === 'end' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </span>
  );
};