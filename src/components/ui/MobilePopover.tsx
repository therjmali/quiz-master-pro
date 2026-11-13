/**
 * MobilePopover — a small settings popover used by the quiz and setup toolbars.
 *
 * Rendered through <Overlay> (portalled to <body>), so it is never clipped by a glass card, always sits above
 * the bottom navigation, always fits the screen (including landscape phones and zoomed UI) and always has a
 * reachable close button. Bottom sheet on phones, centred card from tablet up.
 */
import Overlay, { OverlayHeader } from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Kept for compatibility: the overlay now always fits the screen. */
  desktopWidth?: string;
}

export default function MobilePopover({ open, onClose, children, title, subtitle, icon }: Props) {
  return (
    <Overlay open={open} onClose={onClose} kind="sheet" layer="sheet" labelledBy={title ? 'qmp-popover-title' : undefined} label={title ? undefined : 'Options'}>
      {title ? (
        <OverlayHeader title={title} subtitle={subtitle} icon={icon} onClose={onClose} titleId="qmp-popover-title" />
      ) : null}
      <div className="qmp-panel-body">
        <div className="pb-1">{children}</div>
      </div>
    </Overlay>
  );
}
