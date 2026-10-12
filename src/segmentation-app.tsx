import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import TopBar from './components/segmentation/TopBar';
import LeftToolbar from './components/segmentation/LeftToolbar';
import RightPanel from './components/segmentation/RightPanel';
import BottomBar from './components/segmentation/BottomBar';
import SegmentationModals from './components/segmentation/SegmentationModals';
import ViewerComparison from './components/segmentation/ViewerComparison';
import ImageChatPanel from './components/segmentation/ImageChatPanel';
import PageFeedback from './components/segmentation/PageFeedback';
import { saveMaskOnUnload } from './services/masks';
import ActionInfoModal from './components/segmentation/ActionInfoModal';
import { useKeyboardShortcuts, useToolbarHints } from './hooks/useKeyboardShortcuts';
import { useSegmentationSetup } from './components/segmentation/hooks/useSegmentationSetup';
import { useSegmentationStore } from './stores/segmentationStore';
import { useViewManagerStore } from './stores/viewManagerStore';
import { useConfigLoader } from './hooks/useConfigLoader';
import { bootPage, bootUrls, exposeDebugHandle } from './boot';

const SegmentationApp: React.FC = () => {
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileUserId = 'current';
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('login');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isClassSelectionOpen, setIsClassSelectionOpen] = useState(false);
  const [isImageInfoOpen, setIsImageInfoOpen] = useState(false);
  const [isConfusionMatrixOpen, setIsConfusionMatrixOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  // Chat configuration from project config
  const config = useSegmentationStore((state) => state.config);
  const chatEnabled = config?.chat?.enabled || false;
  const githubRepo = config?.chat?.github_repo || '';
  const utterancesTheme = config?.chat?.utterances_theme || 'github-light';

  // Get config loader hook
  const { loadConfig } = useConfigLoader();

  // An expired session during a request opens the login form
  const loginRequired = useSegmentationStore((state) => state.loginRequired);
  useEffect(() => {
    if (loginRequired) {
      setLoginMode('login');
      setIsLoginOpen(true);
      useSegmentationStore.getState().clearLoginRequest();
    }
  }, [loginRequired]);

  const isResetMaskOpen = useSegmentationStore((state) => state.resetMaskConfirmOpen);
  const errorModalOpen = useSegmentationStore((state) => state.errorModal.isOpen);
  const actionInfoOpen = useSegmentationStore((state) => state.actionInfoPrompt !== null);
  const anyModalOpen = isPreferencesOpen || isProfileOpen || isLoginOpen || isHelpOpen ||
    isResetMaskOpen || isClassSelectionOpen || isImageInfoOpen || isConfusionMatrixOpen ||
    errorModalOpen || actionInfoOpen;
  useKeyboardShortcuts(authChecked && isAuthenticated && !anyModalOpen);
  useToolbarHints();

  // Save unsaved changes when the page is closed or navigated away from
  useEffect(() => {
    const onPageHide = () => {
      const { maskChanged, maskDocument, userMaskData, currentImageId } = useSegmentationStore.getState();
      if (maskChanged && maskDocument && userMaskData && currentImageId) {
        saveMaskOnUnload(currentImageId, maskDocument.final, maskDocument.user);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Note: Export GeoTIFF is now handled in TopBar component

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/user/get/current', {
          credentials: 'same-origin'
        });
        
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          // Show login form if not authenticated
          setIsLoginOpen(true);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsAuthenticated(false);
        setIsLoginOpen(true);
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, []);

  // Initialize app with clean React-first architecture
  useEffect(() => {
    const initializeApp = async () => {
      if (!authChecked || !isAuthenticated) return;

      try {
        await loadConfig();
        await initializeNavigation();
        await initializeMaskData();
      } catch (error) {
        console.error('❌ React: App initialization failed:', error);
        // You can set error state here if needed
      }
    };

    initializeApp();
  }, [authChecked, isAuthenticated]); // Remove loadConfig from dependencies to prevent infinite loop

  // Initialize navigation store with image list
  const initializeNavigation = async () => {
    try {
      // Get current image ID from React store (primary source)
      const currentImageId = useSegmentationStore.getState().currentImageId;
      if (!currentImageId) return;

      const response = await fetch(
        `/segmentation/api/images/list?current_image_id=${encodeURIComponent(currentImageId)}`,
        { credentials: 'same-origin' }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.statusText}`);
      }

      const data = await response.json();

      // Set images in store
      useSegmentationStore.getState().setImages(data.images);

      // Set current image
      useSegmentationStore.getState().setCurrentImage(currentImageId);
    } catch (error) {
      console.error('❌ React: Navigation initialization failed:', error);
    }
  };

  // Load the current image's mask and show the image at the default view
  const initializeMaskData = async () => {
    const currentImageId = useSegmentationStore.getState().currentImageId;
    if (!currentImageId) return;
    await useSegmentationStore.getState().loadMaskForImage(currentImageId);
    const viewStore = useViewManagerStore.getState();
    viewStore.resetCanvas();
    viewStore.setImage(currentImageId, viewStore.imageLocation || [0, 0]);
  };

  // Memoize callbacks to prevent unnecessary re-renders
  const handleOpenPreferences = useCallback(() => setIsPreferencesOpen(true), []);
  const handleOpenHelp = useCallback(() => setIsHelpOpen(true), []);
  const handleSelectClass = useCallback(() => setIsClassSelectionOpen(true), []);
  const handleResetMask = useCallback(() => useSegmentationStore.getState().requestResetMask(), []);
  const handleOpenProfile = useCallback(() => setIsProfileOpen(true), []);
  const handleOpenImageInfo = useCallback(() => setIsImageInfoOpen(true), []);
  const handleOpenConfusionMatrix = useCallback(() => setIsConfusionMatrixOpen(true), []);

  const handleLoginSuccess = useCallback(() => {
    setIsAuthenticated(true);
    setIsLoginOpen(false);
    // Reload the page to reinitialize everything with authenticated state
    window.location.reload();
  }, []);

  // Setup segmentation with custom hook
  useSegmentationSetup({
    authChecked: authChecked && isAuthenticated,
    onOpenPreferences: handleOpenPreferences,
  });


  return (
    <ThemeProvider>
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        {/* Top Bar */}
        <TopBar
        onOpenPreferences={handleOpenPreferences}
        onOpenHelp={handleOpenHelp}
        onOpenProfile={handleOpenProfile}
      />

      {/* Left Toolbar */}
      <LeftToolbar onResetMask={handleResetMask} />

      {/* Main Canvas Area */}
      <div
        style={{
          position: 'fixed',
          left: '60px',
          right: isRightPanelCollapsed ? '0' : '280px',
          top: '50px',
          bottom: '60px',
          overflow: 'auto',
          backgroundColor: '#f5f5f5',
          transition: 'right 0.3s ease',
        }}
      >
        <ViewerComparison />
      </div>

      {/* Right Panel */}
      <RightPanel 
        onSelectClass={handleSelectClass}
        isCollapsed={isRightPanelCollapsed}
        onToggleCollapse={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
      />

      {/* Bottom Bar */}
      <BottomBar
        onOpenImageInfo={handleOpenImageInfo}
        onOpenConfusionMatrix={handleOpenConfusionMatrix}
      />

      {/* Chat toggle button - only show if chat is enabled */}
      {chatEnabled && githubRepo && (
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          style={{
            position: 'fixed',
            right: isChatOpen ? '420px' : '20px',
            bottom: '80px',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            backgroundColor: '#007cba',
            color: 'white',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
            zIndex: 999,
            transition: 'right 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={isChatOpen ? 'Close chat' : 'Open chat'}
        >
          💬
        </button>
      )}

      {/* Chat side panel */}
      {chatEnabled && githubRepo && (
        <ImageChatPanel 
          githubRepo={githubRepo}
          theme={utterancesTheme}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      <PageFeedback />
      <ActionInfoModal />

      <SegmentationModals
        isPreferencesOpen={isPreferencesOpen}
        onClosePreferences={() => setIsPreferencesOpen(false)}
        isProfileOpen={isProfileOpen}
        onCloseProfile={() => setIsProfileOpen(false)}
        profileUserId={profileUserId}
        isLoginOpen={isLoginOpen}
        loginMode={loginMode}
        onLoginSuccess={handleLoginSuccess}
        isHelpOpen={isHelpOpen}
        onCloseHelp={() => setIsHelpOpen(false)}
        isResetMaskOpen={isResetMaskOpen}
        onCloseResetMask={() => useSegmentationStore.getState().closeResetMaskConfirm()}
        onConfirmResetMask={() => useSegmentationStore.getState().resetMask()}
        isClassSelectionOpen={isClassSelectionOpen}
        onCloseClassSelection={() => setIsClassSelectionOpen(false)}
        isImageInfoOpen={isImageInfoOpen}
        onCloseImageInfo={() => setIsImageInfoOpen(false)}
        isConfusionMatrixOpen={isConfusionMatrixOpen}
        onCloseConfusionMatrix={() => setIsConfusionMatrixOpen(false)}
      />

      {/* React Development Indicator */}
      {(window.location.search.includes('debug=1') || window.location.hostname === 'localhost') && (
        <div style={{
          position: 'fixed',
          bottom: '0',
          right: '0',
          backgroundColor: '#4CAF50',
          color: 'white',
          padding: '4px 8px',
          fontSize: '11px',
          fontFamily: 'monospace',
          zIndex: 9999,
          borderTopLeftRadius: '4px',
          opacity: 0.8,
          pointerEvents: 'none',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}>
          ⚛️ React SPA v{React.version}
        </div>
      )}
    </div>
    </ThemeProvider>
  );
};

// Initialize React when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    const container = document.getElementById('react-segmentation-app');
    if (container) {
      // Page data from the template, before anything fetches
      const urls = bootUrls();
      if (urls) useSegmentationStore.getState().setApiUrls(urls);
      const page = bootPage();
      useSegmentationStore.getState().setDebugMode(page.debug);
      useViewManagerStore.getState().setImageLocation(page.imageLocation);
      exposeDebugHandle({ segmentationStore: useSegmentationStore, viewManagerStore: useViewManagerStore });

      const root = createRoot(container);
      root.render(<SegmentationApp />);
    } else {
      console.error('❌ React mount container not found! Looking for #react-segmentation-app');
    }
  } catch (error) {
    console.error('❌ Failed to mount React Segmentation App:', error);
  }
});

export default SegmentationApp;