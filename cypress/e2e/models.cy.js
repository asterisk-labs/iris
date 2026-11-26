/**
 * Switching the AI model in Preferences takes effect on the next prediction.
 */

const store = () => cy.window().its('__IRIS__.store').invoke('getState');

/** Paint the first and second half of the mask's first rows as two classes. */
const paintTwoClasses = () => store().then((s) => {
  const { width } = s.maskDimensions;
  const first = Array.from({ length: 3 * width }, (_, i) => i);
  const second = Array.from({ length: 3 * width }, (_, i) => 3 * width + i);
  s.paintPixels(first, 0);
  s.paintPixels(second, 1);
  s.recordHistory();
});

const predictWith = (alias) => {
  cy.intercept('POST', '/api/v1/images/*/predict').as(alias);
  store().invoke('predictMask');
  return cy.wait(`@${alias}`, { timeout: 60000 }).its('response');
};

describe('AI model choice', () => {
  beforeEach(() => {
    cy.login();
  });

  afterEach(() => {
    // Leave the default for the other specs
    cy.request('/api/v1/user-config').its('body.config').then((config) => {
      config.segmentation.ai_model.type = 'lightgbm';
      cy.request('POST', '/api/v1/user-config', config);
    });
  });

  it('uses the model chosen in Preferences for the next prediction', () => {
    paintTwoClasses();
    predictWith('first').then((response) => {
      expect(response.statusCode).to.equal(200);
      expect(response.body.model.type).to.equal('lightgbm');
    });

    cy.openPreferences();
    cy.selectSegmentationAITab();
    cy.get('[data-testid="input-n-estimators"]').should('exist');
    cy.get('[data-testid="select-model-type"]').select('linear');
    cy.get('[data-testid="input-linear-c"]').should('be.visible');
    cy.get('[data-testid="input-n-estimators"]').should('not.exist');
    cy.savePreferences();

    predictWith('second').then((response) => {
      expect(response.statusCode).to.equal(200);
      expect(response.body.model.type).to.equal('linear');
    });
    store().its('confusionMatrix.totalSamples').should('be.greaterThan', 0);
  });
});
