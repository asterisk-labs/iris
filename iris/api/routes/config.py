"""
Project Configuration API Endpoints

Provides REST API endpoints for managing IRIS project configuration files.
Admin-only access with support for both JWT (React frontend) and Flask session (legacy UI) authentication.

Endpoints:
- GET /api/v1/project-config - Retrieve current project configuration
- PUT /api/v1/project-config - Update project configuration (with backup/rollback)
- POST /api/v1/project-config/validate - Validate configuration without saving
"""

import json
import os
from copy import deepcopy

import flask

from iris.imagecache import DEFAULT_CACHE_MB
from iris.project import current_project
from iris.schema import check_config
from iris.user import requires_admin


def make_relative(path, base_dir):
    """Convert absolute path to relative path from base directory"""
    if isinstance(path, dict):
        return {k: make_relative(v, base_dir) for k, v in path.items()}
    elif isinstance(path, list):
        return [make_relative(p, base_dir) for p in path]
    elif not path or path is False:
        return path
    elif isinstance(path, str):
        # Only convert if it's an absolute path
        if os.path.isabs(path):
            try:
                return os.path.relpath(path, base_dir)
            except ValueError:
                # On Windows, relpath fails if paths are on different drives
                return path
        return path
    return path

@requires_admin
def get_project_config():
    """
    GET /api/v1/project-config

    Retrieve the current project configuration for editing.
    Cleans internal fields added by the system (css_colour, name, stretch, etc.)
    and ensures all data is JSON-serializable.
    Converts absolute paths back to relative paths for editing.

    Returns:
        200: {config: {...}, config_file: "path/to/config.json"}
        401/403: Authentication/authorization error
        500: Server error
    """
    project = current_project()
    try:
        # Get base directory for relative path conversion
        base_dir = os.path.dirname(project.file)

        # Build clean config data structure
        # Use deepcopy to avoid modifying the original project.config object
        config_data = {
            'name': project.config.get('name'),
            'host': project.config.get('host', '127.0.0.1'),
            'port': project.config.get('port', 5000),
            'images': {
                'path': make_relative(deepcopy(project.config['images']['path']), base_dir),
                # As written in the file; None when derived from the images
                'shape': deepcopy(project.configured_shape),
                'thumbnails': make_relative(project.config['images'].get('thumbnails', False), base_dir),
                'metadata': make_relative(project.config['images'].get('metadata', False), base_dir),
                'cache_mb': project.config['images'].get('cache_mb', DEFAULT_CACHE_MB),
            },
            'classes': deepcopy(project.config.get('classes', [])),
            'views': deepcopy(project.config.get('views', {})),
            'view_groups': deepcopy(project.config.get('view_groups', {})),
            'segmentation': deepcopy(project.config.get('segmentation', {})),
            'chat': deepcopy(project.config.get('chat', None)),
        }

        # Clean up views - remove internal fields added during project initialization
        if 'views' in config_data and config_data['views']:
            for _view_name, view_data in config_data['views'].items():
                if isinstance(view_data, dict):
                    # Remove system-added fields that shouldn't be in the config file
                    view_data.pop('name', None)  # View name is the key, not a field
                    view_data.pop('css_colour', None)  # Computed from colour
                    view_data.pop('stretch', None)  # Internal rendering hint

                    # Convert Jinja2 Markup objects back to plain strings
                    if 'description' in view_data:
                        desc = view_data['description']
                        if hasattr(desc, '__html__'):  # Is a Markup object
                            view_data['description'] = str(desc)
                        else:
                            view_data['description'] = str(desc)

                    # Ensure data field is properly formatted (string for monochrome, array for RGB)
                    if 'data' in view_data:
                        data = view_data['data']
                        if isinstance(data, list):
                            view_data['data'] = [str(d) for d in data]
                        else:
                            view_data['data'] = str(data)

        # Clean up classes - remove internal fields
        if 'classes' in config_data and config_data['classes']:
            for class_data in config_data['classes']:
                if isinstance(class_data, dict):
                    class_data.pop('css_colour', None)
                    # Convert Markup descriptions to strings
                    if 'description' in class_data:
                        desc = class_data['description']
                        if hasattr(desc, '__html__'):
                            class_data['description'] = str(desc)

        # Clean up segmentation - ensure it's JSON serializable and convert paths to relative
        if 'segmentation' in config_data and config_data['segmentation']:
            seg = config_data['segmentation']
            # Remove computed fields
            seg.pop('mask_shape', None)
            # Convert segmentation path to relative
            if 'path' in seg:
                seg['path'] = make_relative(seg['path'], base_dir)

        # Test JSON serialization before returning
        try:
            json.dumps(config_data)
        except (TypeError, ValueError) as e:
            flask.current_app.logger.error(f"Config not JSON serializable: {e}")
            # Try to identify the problematic field
            for key, value in config_data.items():
                try:
                    json.dumps({key: value})
                except (TypeError, ValueError):
                    flask.current_app.logger.error(f"Problem with field: {key}")
            raise

        return flask.jsonify({
            'config': config_data,
            'config_file': project.file
        }), 200

    except Exception as e:
        import traceback
        traceback.print_exc()  # Print full traceback to console for debugging
        return flask.jsonify({
            'error': 'Failed to get project config',
            'message': str(e)
        }), 500

@requires_admin
def update_project_config():
    """
    PUT /api/v1/project-config

    Update the project configuration file.

    Process:
    1. Validate required fields and structure
    2. Create backup of current config
    3. Write new config to file
    4. Reload project to validate it works
    5. If reload fails, restore backup and return error

    Returns:
        200: {message: "...", config_file: "..."}
        400: Validation error
        401/403: Authentication/authorization error
        500: Server error
    """
    project = current_project()
    try:
        new_config = flask.request.get_json()
        if not new_config:
            return flask.jsonify({
                'error': 'Missing data',
                'message': 'Configuration data is required'
            }), 400

        # images.shape is optional (derived from the images); drop an empty one
        images = new_config.get('images') if isinstance(new_config, dict) else None
        if isinstance(images, dict) and images.get('shape') in (None, [], [0, 0]):
            images.pop('shape', None)

        errors, _ = check_config(new_config)
        if errors:
            return flask.jsonify({
                'error': 'Invalid configuration',
                'message': '; '.join(errors)
            }), 400

        # Save configuration with backup/rollback safety
        config_file = project.file

        # Step 1: Create backup of existing config (safety net)
        backup_file = config_file + '.backup'
        if os.path.exists(config_file):
            with open(config_file) as f:
                backup_content = f.read()
            with open(backup_file, 'w') as f:
                f.write(backup_content)

        # Step 2: Write new configuration to file
        with open(config_file, 'w') as f:
            json.dump(new_config, f, indent=2)

        # Step 3: Try to reload project with new config (validates it works)
        try:
            project.load_from(config_file)
        except Exception as e:
            # Step 4: If reload fails, restore backup and re-raise error
            if os.path.exists(backup_file):
                with open(backup_file) as f:
                    backup_content = f.read()
                with open(config_file, 'w') as f:
                    f.write(backup_content)
                project.load_from(config_file)

            return flask.jsonify({
                'error': 'Invalid configuration',
                'message': f'Configuration validation failed: {str(e)}'
            }), 400

        return flask.jsonify({
            'message': 'Project configuration successfully updated',
            'config_file': config_file
        }), 200

    except Exception as e:
        return flask.jsonify({
            'error': 'Failed to update project config',
            'message': str(e)
        }), 500

@requires_admin
def validate_project_config():
    """
    POST /api/v1/project-config/validate

    Validate a project configuration without saving it.
    Checks required fields, data types, and referential integrity.

    Returns:
        200: {valid: bool, errors: [...], warnings: [...]}
        400: Missing data
        401/403: Authentication/authorization error
        500: Server error
    """
    try:
        config_data = flask.request.get_json()
        if not config_data:
            return flask.jsonify({
                'error': 'Missing data',
                'message': 'Configuration data is required'
            }), 400

        errors, warnings = check_config(config_data)
        return flask.jsonify({
            'valid': not errors,
            'errors': errors,
            'warnings': warnings
        }), 200

    except Exception as e:
        return flask.jsonify({
            'error': 'Validation failed',
            'message': str(e)
        }), 500
