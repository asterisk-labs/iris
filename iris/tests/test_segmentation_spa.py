"""
Tests for segmentation SPA functionality.

These tests verify that the React migration maintains proper routing and blueprint
registration without breaking existing API endpoints or functionality.
"""
from unittest.mock import MagicMock, Mock, patch

import flask


def test_segmentation_spa_blueprint_registration():
    """
    Test that React SPA migration maintains proper routing without breaking existing functionality.

    Critical checks:
    - React SPA route replaces old Flask template route
    - No route conflicts between old and new blueprints
    """
    import flask

    from iris.segmentation import register_segmentation_blueprints

    app = flask.Flask(__name__)
    register_segmentation_blueprints(app)

    endpoints = [rule.endpoint for rule in app.url_map.iter_rules()]

    # The migration should replace the old route with the new SPA route
    assert 'segmentation.index' not in endpoints, "Old Flask template route should be removed"
    assert 'segmentation_spa.segmentation_spa' in endpoints, "React SPA route should exist"

    for endpoint in ['segmentation.next_image', 'segmentation.previous_image']:
        assert endpoint in endpoints


def test_segmentation_spa_blueprint_configuration():
    """
    Test that SPA blueprint is configured correctly for Flask routing and url_for() calls.

    Verifies the blueprint can be imported and has the correct configuration
    to work with existing url_for() references throughout the codebase.
    """
    from iris.segmentation.spa import spa_bp

    # Blueprint must be properly configured for Flask registration
    assert spa_bp.name == 'segmentation_spa', "Blueprint name must match url_for() calls"
    assert spa_bp.url_prefix == '/segmentation', "URL prefix must match existing routes"


def test_segmentation_spa_route_no_image_id():
    """
    Test SPA route behavior when no image_id parameter is provided (most common case).

    SCENARIO: User visits /segmentation/ without specifying which image to view
    EXPECTED: System should load the default starting image for the project

    This tests the primary code path where:
    1. No image_id is provided in URL parameters
    2. System calls project.get_start_image_id() to determine default image
    4. React template is rendered with the default image
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock the project system to return predictable values
    # This simulates a project where 'default_image' is the starting image
    mock_project.get_start_image_id.return_value = 'default_image'

    # SETUP: Create a minimal Flask app with just our SPA blueprint
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.register_blueprint(spa_bp)

    with app.test_client() as client, app.app_context(), patch('flask.render_template') as mock_render:
        # SETUP: Mock template rendering to avoid needing actual template files
        # This isolates the test to focus on the route logic, not template system
        mock_render.return_value = '<html>React App</html>'

        # ACTION: Make a GET request to /segmentation/ (no image_id parameter)
        response = client.get('/segmentation/')

        # VERIFICATION: Check that the response is successful
        assert response.status_code == 200

        # VERIFICATION: Ensure the system asked for the default starting image
        mock_project.get_start_image_id.assert_called_once()


        # VERIFICATION: Ensure React template was rendered with correct data
        mock_render.assert_called_once_with(
            'segmentation/react-app.html',  # React SPA template
            image_id='default_image',       # The default image ID
            debug_mode=mock_project.debug   # Debug mode from project
        )


def test_segmentation_spa_route_with_valid_image_id():
    """
    Test SPA route behavior when a valid image_id parameter is provided.

    SCENARIO: User visits /segmentation/?image_id=test_image with a specific image
    EXPECTED: System should load that specific image (bypassing default logic)

    This tests the direct image access path where:
    1. User provides a specific image_id in URL parameters
    2. System validates the image_id exists in the project
    4. React template is rendered with the requested image data

    This is commonly used when:
    - User bookmarks a specific image
    - User navigates between images using next/previous buttons
    - User shares a direct link to a specific image
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock project with a list of valid images
    # This simulates a project containing multiple images
    mock_project.image_ids = ['test_image', 'other_image']

    # SETUP: Create Flask app with SPA blueprint
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.register_blueprint(spa_bp)

    with app.test_client() as client, app.app_context(), patch('flask.render_template') as mock_render:
        # SETUP: Mock template rendering
        mock_render.return_value = '<html>React App</html>'

        # ACTION: Request a specific image via URL parameter
        response = client.get('/segmentation/?image_id=test_image')

        # VERIFICATION: Response should be successful
        assert response.status_code == 200

        # Note: get_start_image_id() should NOT be called since we provided an image_id

        # VERIFICATION: React template rendered with the requested image data
        mock_render.assert_called_once_with(
            'segmentation/react-app.html',  # React SPA template
            image_id='test_image',          # The requested image ID
            debug_mode=mock_project.debug   # Debug mode from project
        )


def test_segmentation_spa_route_with_invalid_image_id():
    """
    Test SPA route behavior when an invalid image_id parameter is provided.

    SCENARIO: User visits /segmentation/?image_id=nonexistent_image
    EXPECTED: System should return a 404 error with appropriate message

    This tests the security/validation path where:
    1. User provides an image_id that doesn't exist in the project
    2. System validates image_id against project.image_ids list
    3. System rejects the request with 404 Not Found
    4. User receives clear error message about invalid image

    This prevents users from:
    - Accessing images from other projects
    - Guessing image IDs to access unauthorized content
    - Causing errors by requesting non-existent images
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock project with only specific valid images
    # This simulates a project that only contains certain images
    mock_project.image_ids = ['valid_image1', 'valid_image2']

    # SETUP: Create Flask app with SPA blueprint
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.register_blueprint(spa_bp)

    with app.test_client() as client:
        # ACTION: Request an image that doesn't exist in the project
        response = client.get('/segmentation/?image_id=invalid_image')

        # VERIFICATION: Should return 404 Not Found status
        assert response.status_code == 404

        # VERIFICATION: Should include helpful error message for user
        assert b'Unknown image id!' in response.data


@patch('iris.models.User')
@patch('iris.models.Action')
def test_segmentation_spa_route_with_user_session_and_last_mask(mock_action, mock_user):
    """
    Test SPA route behavior when logged-in user has previously worked on images.

    SCENARIO: Logged-in user visits /segmentation/ and has annotation history
    EXPECTED: System should resume from their last worked image (not project default)

    This tests the "resume work" feature where:
    1. User is logged in (has user_id in session)
    2. User has previously annotated images (Action records exist)
    3. System finds their most recent annotation work
    4. System loads that image instead of the project default
    5. User can continue where they left off

    This improves user experience by:
    - Avoiding repetitive navigation back to current work
    - Maintaining workflow continuity across sessions
    - Prioritizing user's active work over project defaults
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock project defaults (these should be overridden by user history)
    mock_project.get_start_image_id.return_value = 'default_image'

    # SETUP: Mock database query to return user's last annotation
    # This simulates finding the user's most recent work
    mock_last_mask = Mock()
    mock_last_mask.image_id = 'last_worked_image'  # Different from default
    # Mock the SQLAlchemy query chain: Action.query.filter_by().order_by().first()
    mock_action.query.filter_by.return_value.order_by.return_value.first.return_value = mock_last_mask

    # SETUP: Create Flask app with session support
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.secret_key = 'test_key'  # Required for Flask sessions
    app.register_blueprint(spa_bp)

    with app.test_client() as client:
        # SETUP: Simulate logged-in user by setting session data
        with client.session_transaction() as sess:
            sess['user_id'] = 123  # User is logged in

        with app.app_context(), patch('flask.render_template') as mock_render:
            # SETUP: Mock template rendering
            mock_render.return_value = '<html>React App</html>'

            # ACTION: User visits segmentation page (no specific image requested)
            response = client.get('/segmentation/')

            # VERIFICATION: Response should be successful
            assert response.status_code == 200

            # VERIFICATION: System should load user's last worked image, not default

            # VERIFICATION: React template should render with user's last image
            mock_render.assert_called_once_with(
                'segmentation/react-app.html',  # React SPA template
                image_id='last_worked_image',   # User's last work (not default)
                debug_mode=mock_project.debug   # Debug mode from project
            )


@patch('iris.models.User')
@patch('iris.models.Action')
def test_segmentation_spa_route_with_user_session_no_last_mask(mock_action, mock_user):
    """
    Test SPA route behavior when logged-in user has no previous annotation history.

    SCENARIO: New user (or user with no history) visits /segmentation/
    EXPECTED: System should fall back to project default image

    This tests the "new user" path where:
    1. User is logged in (has user_id in session)
    2. User has no previous annotation history (no Action records)
    3. Database query returns None for last annotation
    4. System falls back to project default starting image
    5. User starts fresh with the project's recommended starting point

    This handles cases like:
    - Brand new users starting their first annotation
    - Users who cleared their history
    - Users switching to a new project
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock project defaults (these should be used as fallback)
    mock_project.get_start_image_id.return_value = 'default_image'

    # SETUP: Mock database query to return no previous annotations
    # This simulates a user with no annotation history
    mock_action.query.filter_by.return_value.order_by.return_value.first.return_value = None
    mock_user.query.get.return_value.image_seed = 42

    # SETUP: Create Flask app with session support
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.secret_key = 'test_key'  # Required for Flask sessions
    app.register_blueprint(spa_bp)

    with app.test_client() as client:
        # SETUP: Simulate logged-in user (but with no history)
        with client.session_transaction() as sess:
            sess['user_id'] = 456  # Different user ID from previous test

        with app.app_context(), patch('flask.render_template') as mock_render:
            # SETUP: Mock template rendering
            mock_render.return_value = '<html>React App</html>'

            # ACTION: User visits segmentation page
            response = client.get('/segmentation/')

            # VERIFICATION: Response should be successful
            assert response.status_code == 200

            # VERIFICATION: Since no history exists, should use the start of
            # this user's own order
            mock_project.get_start_image_id.assert_called_once_with(42)

            # VERIFICATION: React template should render with default image
            mock_render.assert_called_once_with(
                'segmentation/react-app.html',  # React SPA template
                image_id='default_image',       # Project default (no user history)
                debug_mode=mock_project.debug   # Debug mode from project
            )


def test_segmentation_spa_route_error_handling():
    """
    Test SPA route error handling when unexpected exceptions occur.

    SCENARIO: System encounters an error while processing the request
    EXPECTED: System should return 500 error with helpful message (not crash)

    This tests the error resilience where:
    1. An unexpected error occurs (database down, file missing, etc.)
    2. The try/catch block catches the exception
    3. System logs the error for debugging
    4. System returns a 500 Internal Server Error to user
    5. User gets a helpful error message instead of a crash

    This prevents:
    - Application crashes that break the entire system
    - Exposing sensitive error details to users
    - Silent failures that are hard to debug
    """
    mock_project = MagicMock()
    from iris.segmentation.spa import spa_bp

    # SETUP: Mock project system to simulate a failure
    # This could represent database errors, file system issues, etc.
    mock_project.get_start_image_id.side_effect = Exception("Test error")

    # SETUP: Create Flask app with SPA blueprint
    app = flask.Flask(__name__)
    app.extensions['iris'] = mock_project
    app.register_blueprint(spa_bp)

    with app.test_client() as client:
        # ACTION: Attempt to access segmentation page during system error
        response = client.get('/segmentation/')

        # VERIFICATION: Should return 500 Internal Server Error (not crash)
        assert response.status_code == 500

        # VERIFICATION: Should return generic error message (not expose internal details)
        assert b'Internal server error' in response.data
