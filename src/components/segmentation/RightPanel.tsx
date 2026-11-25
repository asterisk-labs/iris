import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { useTheme } from '../../contexts/ThemeContext';
import { Command, tooltip } from '../../segmentation/input/shortcuts';
import { controlButtonStyle } from '../controlStyles';
import Sidebar, { SidebarGroup } from './Sidebar';
import { useShortcutAction } from '../../hooks/useKeyboardShortcuts';
import ToolButton from './toolbar/ToolButton';

const ICONS = '/segmentation/static/icons';

const MASK_TYPES: Array<{ value: 'final' | 'user' | 'errors'; icon: string; title: string; label: string; command: Command }> = [
  { value: 'final', icon: `${ICONS}/mask_final.png`, title: 'Final mask', label: 'Final', command: 'mask_final' },
  { value: 'user', icon: `${ICONS}/mask_user.png`, title: 'User mask', label: 'User', command: 'mask_user' },
  { value: 'errors', icon: `${ICONS}/mask_errors.png`, title: 'Error mask', label: 'Errors', command: 'mask_errors' },
];

const FOLDED_SECTIONS_KEY = 'iris-right-panel-folded';

/** Sections of the panel the user folded, remembered across reloads */
const readFoldedSections = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(FOLDED_SECTIONS_KEY) || '{}');
  } catch {
    return {};
  }
};

/** Section of the panel whose title (or shortcut) folds and unfolds it */
const Section: React.FC<{
  title: string;
  command?: Command;
  last?: boolean;
  children: React.ReactNode;
}> = ({ title, command, last = false, children }) => {
  const { theme } = useTheme();
  const [folded, setFolded] = React.useState(() => Boolean(readFoldedSections()[title]));

  const toggle = () => {
    const next = !folded;
    setFolded(next);
    try {
      localStorage.setItem(
        FOLDED_SECTIONS_KEY, JSON.stringify({ ...readFoldedSections(), [title]: next })
      );
    } catch { /* ignore */ }
  };
  useShortcutAction(command, toggle);

  return (
    <section style={{
      padding: '14px 0',
      borderBottom: last ? 'none' : `1px solid ${theme.panelBorder}`,
    }}>
      <button
        onClick={toggle}
        aria-expanded={!folded}
        {...tooltip(`${folded ? 'Show' : 'Hide'} ${title.toLowerCase()}`, ...(command ? [command] : []))}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.gray600,
        }}
      >
        <span style={{
          display: 'inline-block',
          width: '10px',
          fontSize: '10px',
          transform: folded ? 'rotate(-90deg)' : 'none',
          transition: 'transform 0.15s ease',
        }}>▾</span>
        <span style={{
          flex: 1,
          textAlign: 'left',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>{title}</span>
      </button>
      {!folded && <div style={{ marginTop: '12px' }}>{children}</div>}
    </section>
  );
};

/** Button that stays highlighted while its option is on */
const PanelButton: React.FC<{
  label: string;
  title: string;
  command: Command;
  active?: boolean;
  onClick: () => void;
}> = ({ label, title, command, active = false, onClick }) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      {...tooltip(title, command)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...controlButtonStyle(theme, { active, hovered }), flex: 1, minHeight: '34px' }}
    >
      {label}
    </button>
  );
};

interface RightPanelProps {
  expanded: boolean;
  onToggle: () => void;
  onSelectClass: () => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ expanded, onToggle, onSelectClass }) => {
  const { theme, actualThemeName } = useTheme();
  const [classHovered, setClassHovered] = React.useState(false);

  const { showMask, toggleMask, maskType, setMaskType, brightness, saturation, contrast, invert, setBrightness, setSaturation, setContrast, setInvert, resetFilters, changeBrightness, changeSaturation, currentClass, classes } = useSegmentationStore(useShallow(s => ({ showMask: s.showMask, toggleMask: s.toggleMask, maskType: s.maskType, setMaskType: s.setMaskType, brightness: s.brightness, saturation: s.saturation, contrast: s.contrast, invert: s.invert, setBrightness: s.setBrightness, setSaturation: s.setSaturation, setContrast: s.setContrast, setInvert: s.setInvert, resetFilters: s.resetFilters, changeBrightness: s.changeBrightness, changeSaturation: s.changeSaturation, currentClass: s.currentClass, classes: s.classes })));
  
  // Get current class name
  const currentClassName = currentClass >= 0 && currentClass < classes.length 
    ? classes[currentClass].name 
    : 'No class';
  
  // Icon filter for dark theme - invert black icons to white
  const iconFilter = actualThemeName === 'dark'
    ? 'invert(1) brightness(0.9)' 
    : 'none';

  // Segmented control for mask types
  const SegmentedControl: React.FC<{
    options: Array<{ value: string; icon: string; title: string; label: string; command: Command }>;
    value: string;
    onChange: (value: string) => void;
  }> = ({ options, value, onChange }) => {
    return (
      <div style={{ position: 'relative' }}>
        <div style={{
          display: 'flex',
          backgroundColor: theme.segmentedBg,
          borderRadius: '6px',
          padding: '2px',
          gap: '2px',
        }}>
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              aria-label={option.title}
              {...tooltip(option.title, option.command)}
              style={{
                flex: 1,
                padding: '8px',
                backgroundColor: value === option.value ? theme.segmentedActive : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: value === option.value ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <img
                src={option.icon}
                style={{
                  width: '18px',
                  height: '18px',
                  opacity: value === option.value ? 1 : 0.6,
                  filter: iconFilter,
                }}
                alt=""
              />
            </button>
          ))}
        </div>
        
        {/* Labels below buttons */}
        <div style={{
          display: 'flex',
          marginTop: '6px',
          gap: '2px',
        }}>
          {options.map((option) => (
            <div
              key={option.value}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '10px',
                color: value === option.value ? theme.gray900 : theme.gray500,
                fontWeight: value === option.value ? '600' : '500',
                transition: 'color 0.15s ease',
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!expanded) {
    // The same options as icon buttons, like the collapsed toolbar
    return (
      <Sidebar side="right" expanded={false} onToggle={onToggle} name="options" command="right_panel">
        <SidebarGroup expanded={false}>
          <ToolButton icon={`${ICONS}/class.png`} onClick={onSelectClass} title={`Class: ${currentClassName}`} command="class_dialog" />
        </SidebarGroup>
        <SidebarGroup expanded={false}>
          <ToolButton icon={`${ICONS}/show_mask.png`} checked={showMask} onClick={toggleMask} title="Show or hide the mask" command="toggle_mask" />
        </SidebarGroup>
        <SidebarGroup expanded={false}>
          {MASK_TYPES.map((option) => (
            <ToolButton
              key={option.value}
              icon={option.icon}
              checked={maskType === option.value}
              onClick={() => setMaskType(option.value)}
              title={option.title}
              command={option.command}
            />
          ))}
        </SidebarGroup>
        <SidebarGroup expanded={false} last>
          <ToolButton icon={`${ICONS}/brightness_up.png`} onClick={() => changeBrightness(true)} title="Brightness +10%" command="brightness_up" />
          <ToolButton icon={`${ICONS}/brightness_down.png`} onClick={() => changeBrightness(false)} title="Brightness -10%" command="brightness_down" />
          <ToolButton icon={`${ICONS}/saturation_up.png`} onClick={() => changeSaturation(true)} title="Saturation +20%" command="saturation_up" />
          <ToolButton icon={`${ICONS}/saturation_down.png`} onClick={() => changeSaturation(false)} title="Saturation -20%" command="saturation_down" />
          <ToolButton icon={`${ICONS}/contrast.png`} checked={contrast} onClick={() => setContrast(!contrast)} title="Toggle contrast" command="toggle_contrast" />
          <ToolButton icon={`${ICONS}/invert.png`} checked={invert} onClick={() => setInvert(!invert)} title="Toggle invert" command="toggle_invert" />
          <ToolButton icon={`${ICONS}/reset_filters.png`} onClick={resetFilters} title="Reset all image filters" command="reset_filters" />
        </SidebarGroup>
      </Sidebar>
    );
  }

  return (
    <Sidebar side="right" expanded onToggle={onToggle} name="options" command="right_panel">
      <div style={{ padding: '0 14px' }}>

      {/* Class Selection */}
      <Section title="Class">
        <button
          onClick={onSelectClass}
          {...tooltip('Select class, or press 1..9', 'class_dialog')}
          onMouseEnter={() => setClassHovered(true)}
          onMouseLeave={() => setClassHovered(false)}
          style={{
            ...controlButtonStyle(theme, { hovered: classHovered }),
            justifyContent: 'flex-start',
            gap: '10px',
            width: '100%',
            minHeight: '36px',
            fontSize: '13px',
          }}
        >
          <img
            src="/segmentation/static/icons/class.png"
            style={{ 
              width: '18px', 
              height: '18px', 
              opacity: 0.7,
              filter: iconFilter,
            }}
            alt="Class"
          />
          <span style={{ flex: 1, textAlign: 'left', fontWeight: '500' }}>{currentClassName}</span>
        </button>
      </Section>

      {/* Mask Layers */}
      <Section title="Layers" command="fold_layers">
        
        {/* Show/Hide Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '12px',
          padding: '8px 0',
        }}>
          <span style={{ fontSize: '13px', fontWeight: '500', color: theme.gray900 }}>Show Mask</span>
          <button
            onClick={toggleMask}
            style={{
              width: '44px',
              height: '24px',
              backgroundColor: showMask ? theme.toggleOn : theme.toggleOff,
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background-color 0.2s ease',
            }}
            aria-label="Show mask"
            {...tooltip('Show or hide the mask', 'toggle_mask')}
          >
            <div style={{
              position: 'absolute',
              top: '2px',
              left: showMask ? '22px' : '2px',
              width: '20px',
              height: '20px',
              backgroundColor: theme.toggleThumb,
              borderRadius: '50%',
              transition: 'left 0.2s ease',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            }} />
          </button>
        </div>
        
        {/* Mask Type Selector */}
        <div style={{ marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', color: theme.gray600, marginBottom: '8px' }}>Type</div>
          <SegmentedControl
            options={MASK_TYPES}
            value={maskType}
            onChange={(type) => setMaskType(type as 'final' | 'user' | 'errors')}
          />
        </div>
      </Section>

      {/* Filters */}
      <Section title="Adjustments" command="fold_adjustments" last>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Brightness Slider */}
          <div {...tooltip('Brightness', 'brightness_up', 'brightness_down')}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '6px' 
            }}>
              <label style={{ 
                fontSize: '12px', 
                color: theme.gray600,
                fontWeight: '500',
              }}>
                Brightness
              </label>
              <span style={{
                fontSize: '11px',
                color: theme.gray500,
                fontWeight: '600',
              }}>
                {brightness}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="800"
              step="10"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              style={{ 
                width: '100%',
                height: '4px',
                borderRadius: '2px',
                outline: 'none',
                background: `linear-gradient(to right, ${theme.sliderTrackFilled} 0%, ${theme.sliderTrackFilled} ${(brightness / 800) * 100}%, ${theme.sliderTrack} ${(brightness / 800) * 100}%, ${theme.sliderTrack} 100%)`,
                WebkitAppearance: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
              onInput={(e) => {
                const target = e.target as HTMLInputElement;
                const value = Number(target.value);
                const percentage = (value / 800) * 100;
                target.style.background = `linear-gradient(to right, ${theme.sliderTrackFilled} 0%, ${theme.sliderTrackFilled} ${percentage}%, ${theme.sliderTrack} ${percentage}%, ${theme.sliderTrack} 100%)`;
              }}
            />
          </div>

          {/* Saturation Slider */}
          <div {...tooltip('Saturation', 'saturation_up', 'saturation_down')}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '6px' 
            }}>
              <label style={{ 
                fontSize: '12px', 
                color: theme.gray600,
                fontWeight: '500',
              }}>
                Saturation
              </label>
              <span style={{
                fontSize: '11px',
                color: theme.gray500,
                fontWeight: '600',
              }}>
                {saturation}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="800"
              step="20"
              value={saturation}
              onChange={(e) => setSaturation(Number(e.target.value))}
              style={{ 
                width: '100%',
                height: '4px',
                borderRadius: '2px',
                outline: 'none',
                background: `linear-gradient(to right, ${theme.sliderTrackFilled} 0%, ${theme.sliderTrackFilled} ${(saturation / 800) * 100}%, ${theme.sliderTrack} ${(saturation / 800) * 100}%, ${theme.sliderTrack} 100%)`,
                WebkitAppearance: 'none',
                appearance: 'none',
                cursor: 'pointer',
              }}
              onInput={(e) => {
                const target = e.target as HTMLInputElement;
                const value = Number(target.value);
                const percentage = (value / 800) * 100;
                target.style.background = `linear-gradient(to right, ${theme.sliderTrackFilled} 0%, ${theme.sliderTrackFilled} ${percentage}%, ${theme.sliderTrack} ${percentage}%, ${theme.sliderTrack} 100%)`;
              }}
            />
          </div>

          {/* Toggle Buttons Row */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <PanelButton label="Contrast" title="Toggle contrast" command="toggle_contrast" active={contrast} onClick={() => setContrast(!contrast)} />
            <PanelButton label="Invert" title="Toggle invert" command="toggle_invert" active={invert} onClick={() => setInvert(!invert)} />
          </div>

          {/* Reset Button */}
          <div style={{ display: 'flex' }}>
            <PanelButton label="Reset" title="Reset all image filters" command="reset_filters" onClick={resetFilters} />
          </div>
        </div>
      </Section>
      </div>
    </Sidebar>
  );
};

export default RightPanel;
