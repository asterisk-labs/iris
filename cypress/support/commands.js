// ***********************************************
// Custom Cypress Commands for IRIS E2E Testing
// ***********************************************

// Configuration constants
// Note: These timeouts are generous to account for React hydration delays
const TIMEOUTS = {
  PAGE_LOAD: 2000,
  REACT_HYDRATION: 1500,  // Time for React to attach event handlers
  API_CALL: 1500,
  MODAL_RENDER: 2000,
  STATE_UPDATE: 300,
};

const SELECTORS = {
  DIALOGUE: '#dialogue',
  TOOLBAR: '[data-testid="top-bar"]', // Updated to use TopBar instead of old toolbar
  PREFERENCES_BUTTON: '[data-testid="preferences-button"]',
  PREFERENCES_MODAL: '[data-testid="preferences-modal"]',
  SAVE_BUTTON: '[data-testid="save-preferences-button"]',
  CLOSE_BUTTON: '[data-testid="close-preferences-button"]',
};

/**
 * Log in through the API and open the segmentation page.
 *
 * The user must exist: start the server with --admin-user and
 * --admin-password, as CI does.
 *
 * @example
 * cy.login(); // admin / 123
 * cy.login('testuser', 'testpass');
 */
Cypress.Commands.add('login', (username = 'admin', password = '123') => {
  cy.request('POST', '/api/v1/auth/login', { username, password });
  cy.visit('/segmentation/');
  cy.window({ timeout: 30000 }).should((win) => {
    expect(win.__IRIS__, 'debug handle').to.not.equal(undefined);
    const state = win.__IRIS__.store.getState();
    expect(state.maskDocument, 'mask').to.not.equal(null);
    expect(state.isLoading, 'loading').to.equal(false);
  });
});

/**
 * Close help dialogue if it's open
 * 
 * Clicks the X button on the dialogue to close it if visible.
 * Does nothing if the dialogue is not open.
 * 
 * @example
 * cy.closeHelpDialogue();
 */
Cypress.Commands.add('closeHelpDialogue', () => {
  cy.get('body').then($body => {
    // Check for themed HelpModal (data-testid="help-modal")
    const $helpModal = $body.find('[data-testid="help-modal"]');
    if ($helpModal.length > 0 && $helpModal.is(':visible')) {
      cy.log('Closing themed help modal...');
      cy.get('[data-testid="close-help-button"]').click({ force: true });
      cy.wait(500);
      cy.get('[data-testid="help-modal"]').should('not.exist');
      return;
    }
    // Fallback: check for legacy #dialogue
    const $dialogue = $body.find('#dialogue');
    if ($dialogue.length > 0 && $dialogue.css('display') !== 'none' && $dialogue.is(':visible')) {
      cy.log('Closing legacy dialogue...');
      cy.get('#dialogue-close').click({ force: true });
      cy.wait(500);
      cy.get('#dialogue').should('not.be.visible');
    }
  });
});

/**
 * Open the preferences modal
 * 
 * Clicks the preferences button and waits for the modal to load.
 * Automatically closes help dialog if it's open.
 * 
 * @example
 * cy.openPreferences();
 */
Cypress.Commands.add('openPreferences', () => {
  // Close help dialogue if it's open (appears on first launch)
  cy.closeHelpDialogue();
  
  // Wait a bit for any animations to complete
  cy.wait(1000);
  
  // Intercept config fetch to know when modal is ready
  cy.intercept('GET', '/api/v1/user-config').as('getUserConfig');
  
  // Click preferences button (force: true bypasses visibility checks for clipped elements)
  cy.get(SELECTORS.PREFERENCES_BUTTON)
    .should('exist')
    .click({ force: true });
  
  // Wait for config to load and modal to render
  cy.wait('@getUserConfig', { timeout: TIMEOUTS.API_CALL });
  cy.get(SELECTORS.PREFERENCES_MODAL).should('be.visible');
});

/**
 * Save preferences and close the modal
 * 
 * Clicks the save button and waits for the save API call to complete.
 * The modal should close automatically on successful save.
 * 
 * @example
 * cy.savePreferences();
 */
Cypress.Commands.add('savePreferences', () => {
  // Intercept save API call
  cy.intercept('POST', '/api/v1/user-config').as('saveConfig');
  
  // Click save button (force: true to handle modal overflow/positioning)
  cy.get(SELECTORS.SAVE_BUTTON).click({ force: true });
  
  // Wait for save to complete
  cy.wait('@saveConfig', { timeout: TIMEOUTS.API_CALL }).then((interception) => {
    if (interception.response.statusCode !== 200) {
      cy.log(`WARNING: Save returned status ${interception.response.statusCode}`);
    }
  });
  
  // Verify modal closed (React unmounts it, so it won't exist in DOM)
  cy.get(SELECTORS.PREFERENCES_MODAL).should('not.exist');
});

/**
 * Close preferences modal without saving
 * 
 * Clicks the close button to dismiss the modal.
 * 
 * @example
 * cy.closePreferences();
 */
Cypress.Commands.add('closePreferences', () => {
  cy.get(SELECTORS.CLOSE_BUTTON).click({ force: true });
  // Verify modal closed (React unmounts it, so it won't exist in DOM)
  cy.get(SELECTORS.PREFERENCES_MODAL).should('not.exist');
});

/**
 * Select the Segmentation AI tab in the preferences modal
 * 
 * Clicks the Segmentation AI tab button to switch to that tab.
 * Should be called after openPreferences().
 * 
 * @example
 * cy.openPreferences();
 * cy.selectSegmentationAITab();
 */
Cypress.Commands.add('selectSegmentationAITab', () => {
  cy.log('Selecting Segmentation AI tab...');
  cy.get('[data-testid="tab-segmentation-ai"]')
    .should('be.visible')
    .click();
  
  // Wait for tab content to render
  cy.wait(TIMEOUTS.STATE_UPDATE);
  cy.log('✓ Segmentation AI tab selected');
});

/**
 * Set a slider value by typing into its editable number input
 * 
 * Uses data-testid for robust, semantic selection.
 * Directly sets the value and triggers React's onChange event.
 * 
 * Note: Sliders have editable number inputs for better UX and testability.
 * 
 * @param {string} testId - The data-testid value (without 'data-testid=' prefix)
 * @param {number|string} value - The value to set
 * 
 * @example
 * cy.setSliderValue('input-n-estimators', 120);
 * cy.setSliderValue('input-max-depth', 60);
 */
Cypress.Commands.add('setSliderValue', (testId, value) => {
  cy.log(`Setting slider [data-testid="${testId}"] to ${value}`);
  
  // Set value directly and trigger React onChange
  cy.get(`[data-testid="${testId}"]`).then($input => {
    const input = $input[0];
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    
    // Set the value using native setter
    nativeInputValueSetter.call(input, String(value));
    
    // Trigger React's onChange by dispatching input event
    const event = new Event('input', { bubbles: true });
    input.dispatchEvent(event);
    
    // Also trigger change event for good measure
    const changeEvent = new Event('change', { bubbles: true });
    input.dispatchEvent(changeEvent);
  });
  
  // Wait for React state update
  cy.wait(TIMEOUTS.STATE_UPDATE);
  
  // Verify the value was set
  cy.get(`[data-testid="${testId}"]`)
    .should('have.value', String(value));
  
  cy.log(`✓ Slider [data-testid="${testId}"] updated to ${value}`);
});
