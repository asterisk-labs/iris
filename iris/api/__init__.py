"""The JSON (and image) API, served under /api/v1.

all_routes() is the one list of what the API offers. Every view must carry
`requires_auth` or `requires_admin` unless its route is marked public, which
iris/tests/test_api_v1.py checks for each entry.

`legacy` is the path a route had before /api/v1. It answers with a redirect
that keeps the method and body (307), for one release.
"""
from collections import namedtuple

import flask

Route = namedtuple('Route', 'method path view legacy public')


def _route(method, path, view, *legacy, public=False):
    return Route(method, path, view, legacy, public)


def health():
    """Health check for monitoring and load balancers."""
    from iris.extensions import db
    try:
        db.session.execute('SELECT 1')
    except Exception:
        flask.current_app.logger.exception('Health check failed')
        return flask.jsonify({'status': 'unhealthy'}), 503
    return flask.jsonify({'status': 'healthy'})


def all_routes():
    from iris import main, segmentation, user
    from iris.admin import api as admin
    from iris.api.routes import config
    from iris.segmentation import api as segmentation_api
    from iris.user import api as user_api

    return [
        _route('GET', '/health', health, '/api/health', '/api/config/health', public=True),

        # Logging in and out
        _route('GET', '/auth/session', user_api.get_current_user, '/user/api/current', public=True),
        _route('POST', '/auth/register', user.register, '/user/register', public=True),
        _route('POST', '/auth/login', user.login, '/user/login', public=True),
        _route('GET', '/auth/logout', user.logout, '/user/logout', public=True),
        _route('POST', '/auth/request-password-reset', user.request_password_reset,
               '/user/request-password-reset', public=True),
        _route('POST', '/auth/change-password', user_api.change_password,
               '/user/api/change-password'),

        # Users; <user_id> may be "current"
        _route('GET', '/users/<user_id>', user.get, '/user/get/<user_id>'),
        _route('POST', '/users/<user_id>', user.set, '/user/set/<user_id>'),
        _route('GET', '/users/<user_id>/profile', user_api.get_profile,
               '/user/api/profile/<user_id>'),

        # Configuration
        _route('GET', '/config', segmentation_api.get_config, '/segmentation/api/config'),
        _route('GET', '/user-config', segmentation_api.get_user_config,
               '/segmentation/api/user-config'),
        _route('POST', '/user-config', segmentation_api.save_user_config,
               '/segmentation/api/user-config', '/user/save_config'),
        _route('GET', '/project-config', config.get_project_config, '/api/config/project'),
        _route('PUT', '/project-config', config.update_project_config, '/api/config/project'),
        _route('POST', '/project-config/validate', config.validate_project_config,
               '/api/config/project/validate'),

        # Images
        _route('GET', '/images', segmentation_api.list_images, '/segmentation/api/images/list'),
        _route('GET', '/images/<image_id>/next', segmentation_api.next_image),
        _route('GET', '/images/<image_id>/views/<view>', main.image, '/image/<image_id>/<view>'),
        _route('GET', '/images/<image_id>/info', main.image_info, '/image_info/<image_id>'),
        _route('GET', '/images/<image_id>/metadata', main.metadata, '/metadata/<image_id>'),
        _route('GET', '/images/<image_id>/thumbnail', main.thumbnail, '/thumbnail/<image_id>'),
        _route('GET', '/images/<image_id>/geotiff', segmentation_api.export_geotiff,
               '/segmentation/api/export-geotiff/<image_id>'),

        # Annotations
        _route('GET', '/images/<image_id>/mask', segmentation.load_mask,
               '/segmentation/load_mask/<image_id>'),
        _route('POST', '/images/<image_id>/mask', segmentation.save_mask,
               '/segmentation/save_mask/<image_id>'),
        _route('POST', '/images/<image_id>/predict', segmentation.predict_mask,
               '/segmentation/predict_mask/<image_id>'),
        _route('GET', '/images/<image_id>/action', main.get_action_info,
               '/get_action_info/<image_id>/segmentation'),
        _route('POST', '/actions/<action_id>', main.set_action_info,
               '/set_action_info/<action_id>'),

        # Admin pages
        _route('GET', '/admin/users', admin.users, '/admin/api/users'),
        _route('GET', '/admin/actions', admin.actions, '/admin/api/actions/segmentation'),
        _route('GET', '/admin/images', admin.images, '/admin/api/images'),
        _route('GET', '/admin/password-reset-requests', admin.get_password_reset_requests,
               '/admin/api/password-reset-requests'),
        _route('POST', '/admin/password-reset-requests/<int:request_id>/generate-password',
               admin.generate_temporary_password,
               '/admin/api/password-reset-requests/<int:request_id>/generate-password'),
        _route('GET', '/admin/images/<image_id>/merged-geotiff', admin.export_merged_geotiff,
               '/admin/api/export-merged-geotiff/<image_id>'),
        _route('POST', '/admin/export-all-geotiffs', admin.export_all_geotiffs,
               '/admin/api/export-all-geotiffs'),
    ]


def _redirect_to(endpoint):
    def redirect(**values):
        url = flask.url_for(endpoint, **values)
        query = flask.request.query_string.decode()
        return flask.redirect(f'{url}?{query}' if query else url, 307)
    return redirect


def register_api(app):
    """Add every route, and redirects from the paths they used to have."""
    for route in all_routes():
        endpoint = f'api:{route.method}:{route.path}'
        app.add_url_rule(
            '/api/v1' + route.path, endpoint, route.view, methods=[route.method]
        )
        for legacy in route.legacy:
            app.add_url_rule(
                legacy, f'legacy:{route.method}:{legacy}', _redirect_to(endpoint),
                methods=[route.method],
            )
