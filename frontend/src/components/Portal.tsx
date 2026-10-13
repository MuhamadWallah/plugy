import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders overlays at the end of <body>, so they stack above the sticky navbar and footer
 * no matter where in the tree they are opened from.
 */
export const Portal = ({ children }: { children: ReactNode }) => createPortal(children, document.body);
