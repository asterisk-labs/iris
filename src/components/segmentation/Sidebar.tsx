/**
 * Columns on both sides of the views
 *
 * The toolbar on the left and the options on the right are the same kind of
 * column: the same width, the same button on top to expand or collapse them,
 * and icon buttons when collapsed. They change size at once, without an
 * animation, so the views never show the background while resizing.
 */

import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Command, tooltip } from '../../segmentation/input/shortcuts';
import { controlButtonStyle } from '../controlStyles';

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 60;

const SIDEBARS_KEY = 'iris-sidebars';
// Where the toolbar used to remember it, before both columns were
const OLD_TOOLBAR_KEY = 'leftToolbarExpanded';

/** Which columns are expanded, remembered across reloads */
export const useSidebars = () => {
  const [expanded, setExpanded] = React.useState<{ left: boolean; right: boolean }>(() => {
    try {
      const saved = localStorage.getItem(SIDEBARS_KEY);
      if (saved) return { left: false, right: true, ...JSON.parse(saved) };
      return { left: localStorage.getItem(OLD_TOOLBAR_KEY) === 'true', right: true };
    } catch {
      return { left: false, right: true };
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(SIDEBARS_KEY, JSON.stringify(expanded));
      localStorage.removeItem(OLD_TOOLBAR_KEY);
    } catch { /* ignore */ }
  }, [expanded]);

  const toggle = (side: 'left' | 'right') => setExpanded((current) => ({ ...current, [side]: !current[side] }));

  return {
    leftExpanded: expanded.left,
    rightExpanded: expanded.right,
    toggleLeft: () => toggle('left'),
    toggleRight: () => toggle('right'),
  };
};

export const sidebarWidth = (expanded: boolean) => (expanded ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH);

interface SidebarProps {
  side: 'left' | 'right';
  expanded: boolean;
  onToggle: () => void;
  /** What the column holds, for the tooltip of its toggle button */
  name: string;
  command?: Command;
  children: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ side, expanded, onToggle, name, command, children }) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = React.useState(false);

  // The arrow points to where the column goes
  const arrow = (side === 'left') === expanded ? '◀' : '▶';

  return (
    <aside
      className="sidebar"
      style={{
        position: 'fixed',
        [side]: 0,
        top: '50px',
        bottom: '60px',
        width: `${sidebarWidth(expanded)}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: '10px 0',
        boxSizing: 'border-box',
        backgroundColor: theme.panelBg,
        [side === 'left' ? 'borderRight' : 'borderLeft']: `1px solid ${theme.panelBorder}`,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 900,
      }}
      onWheel={(e) => e.stopPropagation()}
      // Left alone on the toolbar, so clicks there still close the open menus
      onMouseDown={side === 'right' ? (e) => e.stopPropagation() : undefined}
    >
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} the ${name}`}
        {...tooltip(`${expanded ? 'Collapse' : 'Expand'} the ${name}`, ...(command ? [command] : []))}
        style={{
          ...controlButtonStyle(theme, { hovered }),
          flexShrink: 0,
          flexDirection: side === 'left' ? 'row' : 'row-reverse',
          margin: expanded ? '0 14px 5px' : '0 5px 5px',
        }}
      >
        <span style={{ fontSize: '11px' }}>{arrow}</span>
        {expanded && <span>Collapse</span>}
      </button>
      {children}
    </aside>
  );
};

/** Buttons of a column, separated from the next group by a line */
export const SidebarGroup: React.FC<{
  expanded: boolean;
  last?: boolean;
  children: React.ReactNode;
}> = ({ expanded, last = false, children }) => {
  const { theme } = useTheme();
  return (
    <>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: expanded ? '0 14px' : '0 5px',
        listStyle: 'none',
        margin: 0,
      }}>
        {children}
      </div>
      {!last && (
        <div style={{
          flexShrink: 0,
          height: '1px',
          margin: expanded ? '5px 14px' : '5px 10px',
          backgroundColor: theme.panelBorder,
        }} />
      )}
    </>
  );
};

export default Sidebar;
