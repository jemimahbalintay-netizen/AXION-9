import type { ReactNode, SVGProps } from 'react';

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Base({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSend = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.5 12 3 4.5c0-.6.6-1 1.1-.8l16.3 7.4c.5.2.5.9 0 1.1L4.1 19.6c-.5.2-1.1-.2-1.1-.8L4.5 12Zm0 0h7" />
  </Base>
);

export const IconStop = (p: IconProps) => (
  <Base {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
  </Base>
);

export const IconPlus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const IconTrash = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5L18 7M9 7V4.5C9 3.7 9.7 3 10.5 3h3C14.3 3 15 3.7 15 4.5V7" />
  </Base>
);

export const IconCopy = (p: IconProps) => (
  <Base {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Base>
);

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 12.5 5.5 5.5L20 6.5" />
  </Base>
);

export const IconRefresh = (p: IconProps) => (
  <Base {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6" />
  </Base>
);

export const IconChevron = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const IconMenu = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Base>
);

export const IconPanel = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </Base>
);

export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Base>
);

export const IconCalc = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h4" />
  </Base>
);

export const IconSwap = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </Base>
);

export const IconClock = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const IconLattice = (p: IconProps) => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <circle cx="12" cy="18" r="2.2" />
    <path d="M7.8 7.2 11 16.2M16.2 7.2 13 16.2M8.2 6h7.6" />
  </Base>
);

export const IconText = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h9" />
  </Base>
);

export const IconDice = (p: IconProps) => (
  <Base {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <circle cx="9" cy="9" r="0.6" fill="currentColor" />
    <circle cx="15" cy="9" r="0.6" fill="currentColor" />
    <circle cx="9" cy="15" r="0.6" fill="currentColor" />
    <circle cx="15" cy="15" r="0.6" fill="currentColor" />
    <circle cx="12" cy="12" r="0.6" fill="currentColor" />
  </Base>
);

export const IconCircuit = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="8" width="8" height="8" rx="1.5" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M19 5l-2.5 2.5M5 19l2.5-2.5M19 19l-2.5-2.5" />
  </Base>
);

export const IconX = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Base>
);

export const IconDatabase = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
    <path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
  </Base>
);

export const IconPulse = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 12h4l2.5-6.5L14 18l2.5-6h5" />
  </Base>
);

export const IconAlert = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.5h.01" />
  </Base>
);

export const IconInfo = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.5h.01" />
  </Base>
);

export const IconNote = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 4.5C5 3.7 5.7 3 6.5 3h11C18.3 3 19 3.7 19 4.5v11L14.5 20h-8C5.7 20 5 19.3 5 18.5v-14Z" />
    <path d="M14 20v-4.5c0-.3.2-.5.5-.5H19M9 8h6M9 12h4" />
  </Base>
);

export const IconTask = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </Base>
);

export const IconCommand = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 9V6a3 3 0 1 0-3 3h3Zm0 0v6m0-6h6m-6 6H6a3 3 0 1 0 3 3v-3Zm6-6V6a3 3 0 1 1 3 3h-3Zm0 0v6m0 0h3a3 3 0 1 1-3 3v-3Z" />
  </Base>
);
