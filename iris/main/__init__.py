import io
import json

import flask
import markupsafe
import numpy as np
from PIL import Image as PILImage
from skimage.transform import resize

from iris.expressions import ExpressionError
from iris.models import Action, db
from iris.project import current_project
from iris.user import requires_auth

main_app = flask.Blueprint(
    'main', __name__,
    template_folder='templates',
    static_folder='static'
)

@main_app.route('/')
def index():
    return flask.redirect(
        flask.url_for('segmentation_spa.segmentation_spa')
    )

@main_app.route('/image/<image_id>/<view>')
def image(image_id, view):
    project = current_project()
    if image_id not in project.image_ids or view not in project['views']:
        return flask.make_response('Unknown image or view!', 404)
    try:
        image = project.render_image(image_id, project['views'][view])
    except ExpressionError as error:
        return flask.make_response(f"View '{view}': {error}", 400)
    return array_to_png(image)

@main_app.route('/image_info/<image_id>')
@requires_auth
def image_info(image_id):
    user_id = flask.session['user_id']

    actions = Action.query.filter_by(image_id=image_id, type='segmentation').all()
    info = {'count': len(actions), 'current_user_score': None}
    for action in actions:
        if action.user_id == user_id:
            info['current_user_score'] = action.score
            info['current_user_score_unverified'] = action.unverified
            break

    data = {'segmentation': info}
    data['id'] = image_id
    return flask.jsonify(data)

@main_app.route('/get_action_info/<image_id>/<action_type>')
@requires_auth
def get_action_info(image_id, action_type):
    user_id = flask.session['user_id']

    action = Action.query.filter_by(image_id=image_id, user_id=user_id, type=action_type).first_or_404()

    return flask.jsonify(action.to_json())

@main_app.route('/set_action_info/<action_id>', methods=['POST'])
@requires_auth
def set_action_info(action_id):
    action = Action.query.get_or_404(action_id)

    for k, v in json.loads(flask.request.data).items():
        if k == "difficulty":
            action.difficulty = int(v)
        elif k == "notes":
            action.notes = v
        elif k == "complete":
            action.complete = bool(v)
        else:
            return flask.make_response(f"Unknown parameter <i>{k}</i>!", 400)

    db.session.add(action)
    db.session.commit()

    return flask.make_response("Saved new action info successfully")

@main_app.route('/metadata/<image_id>', methods=['GET'])
def metadata(image_id):
    project = current_project()
    metadata = project.get_metadata(image_id)

    if not metadata:
        return flask.make_response("No metadata found!", 404)

    if flask.request.args.get('safe_html', False):
        metadata = {
            k: markupsafe.Markup(str(v))
            for k, v in metadata.items()
        }

    return flask.jsonify(metadata)

@main_app.route('/thumbnail/<image_id>', methods=['GET'])
def thumbnail(image_id):
    project = current_project()
    size = flask.request.args.get("size", None)
    array = project.get_thumbnail(image_id)

    if size is not None:
        print(size, tuple(size.split("x")))
        size = map(int, size.split("x"))
        array = resize(array, size)

    return array_to_png(array)

def array_to_png(array):
    if issubclass(array.dtype.type, np.floating):
        array = np.clip(array * 255., 0, 255).astype('uint8')

    img = PILImage.fromarray(array) # convert arr to image
    file_object = io.BytesIO()   # create file in memory
    img.save(file_object, 'PNG') # save PNG in file in memory
    file_object.seek(0)          # move to beginning of file
    return flask.send_file(file_object,  mimetype='image/png')
