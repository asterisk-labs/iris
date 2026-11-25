"""Which image a user goes to next."""
import flask

from iris.models import Action, User
from iris.ordering import annotation_counts, least_annotated_next, next_in_order
from iris.project import current_project


def user_image_order():
    """The logged-in user and the project's image ids in their order."""
    user = User.query.get(flask.session['user_id'])
    return user, current_project().image_order(user.image_seed)


def next_image_id(user, order, image_id):
    """The image to show after image_id.

    With prioritise_unmarked_images this is the next image in the user's
    order with the fewest annotations, so it depends on what has been saved
    so far and is worked out when the user navigates.
    """
    if not current_project()['segmentation']['prioritise_unmarked_images']:
        return next_in_order(order, image_id)
    annotations = [(a.image_id, a.user_id) for a in Action.query.all()]
    return least_annotated_next(
        order, image_id, annotation_counts(annotations, user.id)
    )
