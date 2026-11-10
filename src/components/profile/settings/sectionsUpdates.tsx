import { memo } from 'react';
import { ArrowUpCircle } from 'lucide-react';
import { SettingsSection, SettingRow } from './controls';
import type { SectionProps } from './sectionsA';
import UpdatePanel from '../../update/UpdatePanel';
import { hasUpdate, useUpdateState } from '../../../platform/updater';

/** Settings -> App updates: version, check, download and install inside the app. */
export const UpdatesSection = memo(function UpdatesSection({ open, onToggle }: SectionProps) {
  const u = useUpdateState();
  return (
    <SettingsSection id="updates" icon={<ArrowUpCircle className="w-4 h-4" />} open={open} onToggle={onToggle}>
      <SettingRow id="appUpdate" title={hasUpdate(u) ? `Version ${u.info?.version} is available` : 'Check for updates'} hint="Download and install the latest version without leaving the app" inline={false}
        control={open ? <UpdatePanel /> : null} />
    </SettingsSection>
  );
});
