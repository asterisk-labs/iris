/**
 * The annotation path end to end: paint two classes, predict, save, reload,
 * and find the same mask. Then move between images.
 *
 * Painting goes through mouse events on the map of a view and the rest through
 * the keyboard. The mask is read through window.__IRIS__, the debug handle.
 */

/** Retry until `check` passes on the current state of the store. */
const state = (check, timeout = 30000) =>
  cy.window({ timeout }).should((win) => {
    expect(win.__IRIS__, 'debug handle').to.not.equal(undefined);
    check(win.__IRIS__.store.getState());
  }).then((win) => win.__IRIS__.store.getState());

const open = (path) => {
  cy.visit(path);
  state((s) => {
    expect(s.images.length, 'images').to.be.greaterThan(1);
    expect(s.maskDocument, 'mask').to.not.equal(null);
    expect(s.isLoading, 'loading').to.equal(false);
  });
};

/**
 * Drag across the middle of the image in the first view, at a height from 0
 * to 1 of the image. The map fits the square image in the middle of the view.
 */
const stroke = (height) => {
  cy.get('.maplibregl-canvas').first().then(($canvas) => {
    const canvas = $canvas[0];
    const win = canvas.ownerDocument.defaultView;
    const box = canvas.getBoundingClientRect();
    const side = Math.min(box.width, box.height);
    const fire = (target, type, x, buttons) => target.dispatchEvent(new win.MouseEvent(type, {
      clientX: box.left + box.width / 2 + (x - 0.5) * side,
      clientY: box.top + box.height / 2 + (height - 0.5) * side,
      button: 0, buttons, bubbles: true,
    }));
    fire(canvas, 'mousedown', 0.4, 1);
    fire(canvas, 'mousemove', 0.5, 1);
    fire(canvas, 'mousemove', 0.6, 1);
    fire(win, 'mouseup', 0.6, 0);
  });
};

const text = (mask) => Array.from(mask).join('');

describe('Annotating an image', () => {
  beforeEach(() => {
    cy.request('POST', '/api/v1/auth/login', { username: 'admin', password: '123' });
  });

  it('paints, predicts, saves and loads the same mask', () => {
    open('/segmentation/');
    // Start from an empty mask, whatever earlier runs saved
    state(() => {}).then((s) => {
      const n = s.maskDocument.final.length;
      s.setMasks(new Uint8Array(n), new Uint8Array(n));
      s.setToolSize(9);
      s.setCurrentClass(1);
    });
    stroke(0.4);
    state(() => {}).then((s) => s.setCurrentClass(2));
    stroke(0.6);
    state((s) => {
      expect(s.userPixelCounts[1], 'pixels of class 1').to.be.greaterThan(10);
      expect(s.userPixelCounts[2], 'pixels of class 2').to.be.greaterThan(10);
    });

    cy.get('body').type('a');
    state((s) => {
      expect(s.predictionRevision, 'prediction').to.not.equal(null);
      expect(s.isLoading, 'loading').to.equal(false);
    }, 60000).then((s) => {
      const predicted = { final: text(s.maskDocument.final), user: text(s.maskDocument.user) };
      const filled = [...predicted.final]
        .filter((c, i) => c !== '0' && predicted.user[i] === '0').length;
      expect(filled, 'pixels filled by the AI').to.be.greaterThan(0);

      cy.get('body').type('s');
      state((now) => {
        expect(now.maskChanged, 'unsaved changes').to.equal(false);
        expect(now.isLoading, 'loading').to.equal(false);
      });
      open(`/segmentation/?image_id=${s.currentImageId}`);
      state(() => {}).then((loaded) => {
        expect(text(loaded.maskDocument.final) === predicted.final, 'same final mask').to.equal(true);
        expect(text(loaded.maskDocument.user) === predicted.user, 'same user mask').to.equal(true);
      });
    });
  });

  it('Enter follows the order of the server and Backspace goes back', () => {
    open('/segmentation/');
    state(() => {}).then(({ currentImageId: start }) => {
      cy.request(`/api/v1/images/${start}/next`).its('body.image_id').then((next) => {
        cy.get('body').type('{enter}');
        cy.location('search', { timeout: 20000 }).should('include', `image_id=${next}`);
        state((s) => {
          expect(s.currentImageId).to.equal(next);
          expect(s.maskDocument, 'mask').to.not.equal(null);
          expect(s.isLoading, 'loading').to.equal(false);
          expect(s.images.length, 'images').to.be.greaterThan(1);
        });
        cy.get('body').type('{backspace}');
        cy.location('search', { timeout: 20000 }).should('include', `image_id=${start}`);
      });
    });
  });

  it('shows the login form and no image data to anonymous visitors', () => {
    cy.request('/api/v1/auth/logout');
    cy.visit('/segmentation/');
    cy.get('#login-username', { timeout: 20000 }).should('be.visible');
    cy.request({ url: '/api/v1/images/coast/views/RGB', failOnStatusCode: false })
      .its('status').should('equal', 403);
  });

  it('sorts and filters the image list', () => {
    open('/segmentation/');
    cy.get('[title="Select image to navigate"]').click();
    cy.get('.image-name').then(($names) => {
      expect([...$names].map((e) => e.textContent)).to.deep.equal(['coast', 'mountains']);
    });
    // Typing must not trigger the one-letter shortcuts
    cy.get('[aria-label="Find an image"]').type('coas');
    cy.get('.image-name').should('have.length', 1).and('have.text', 'coast');
    state((s) => expect(s.currentTool).to.equal('draw'));
  });

  it('loads the admin pages', () => {
    cy.intercept('/api/v1/admin/**').as('data');
    ['users', 'actions/segmentation', 'images', 'password-resets'].forEach((page) => {
      cy.visit(`/admin/${page}`);
      cy.wait('@data').its('response.statusCode').should('be.oneOf', [200, 304]);
    });
  });
});
