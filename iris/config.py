# General settings
# SECRET_KEY is loaded per project, see iris/secret_key.py

# Browsers do not send the login cookie with requests that other sites make,
# except when the user follows a link. This is what protects the POST routes
# from being called by other sites.
SESSION_COOKIE_SAMESITE = 'Lax'
EXPLAIN_TEMPLATE_LOADING = True

# Flask-SQLAlchemy settings
SQLALCHEMY_TRACK_MODIFICATIONS = False

# Flask-Compress settings
COMPRESS_MIMETYPES = [
        'text/html', 'text/css', 'text/xml',
        'application/json', 'application/octet-stream',
        'application/javascript'
    ]
