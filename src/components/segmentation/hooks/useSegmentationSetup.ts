import { useEffect } from 'react';

interface UseSegmentationSetupProps {
  authChecked: boolean;
  onOpenPreferences: () => void;
}

/** Open the preferences when the page is linked with ?openPreferences=true (from the admin pages). */
export const useSegmentationSetup = ({ authChecked, onOpenPreferences }: UseSegmentationSetupProps) => {
  useEffect(() => {
    if (!authChecked) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('openPreferences') === 'true') {
      onOpenPreferences();
      urlParams.delete('openPreferences');
      const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }, [authChecked, onOpenPreferences]);
};
