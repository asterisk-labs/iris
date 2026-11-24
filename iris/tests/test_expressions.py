import json
from pathlib import Path

import numpy as np
import pytest
from skimage.filters import sobel
from skimage.segmentation import felzenszwalb

from iris.expressions import ExpressionError, evaluate, parse

CASES = json.loads(Path(__file__).with_name('expression_cases.json').read_text(encoding='utf-8'))

RNG = np.random.RandomState(0)
BANDS = {f'B{i}': RNG.rand(8, 9) for i in range(1, 13)}
IMAGE = {'S': BANDS}
FLAT = {'$' + k: v for k, v in BANDS.items()}


@pytest.mark.parametrize('expression', CASES['valid'])
def test_valid_expressions_evaluate(expression):
    evaluate(expression, {**IMAGE, **FLAT})


# "edges" parses as a band name, so it is only rejected on evaluation
@pytest.mark.parametrize('expression', CASES['invalid'])
def test_invalid_expressions_are_rejected(expression):
    with pytest.raises(ExpressionError):
        evaluate(expression, {**IMAGE, **FLAT})


def _old_eval(expression, image):
    """What render_image did before, for the expressions both accept."""
    import re
    env = {
        'max': np.max, 'min': np.min, 'mean': np.mean, 'median': np.median,
        'log': np.log, 'exp': np.exp, 'sin': np.sin, 'cos': np.cos,
        'PI': np.pi, 'edges': sobel, 'superpixels': felzenszwalb,
        **{k.strip('$'): v for k, v in image.items()},
    }
    expression = re.sub(r'\$(\w+)\.(\w+)', r'\1["\2"]', expression)
    expression = re.sub(r'\$(\w+)', r'\1', expression)
    return eval(expression, {'__builtins__': None}, env)


@pytest.mark.parametrize('expression', CASES['valid'])
def test_same_values_and_dtypes_as_eval(expression):
    for image in ({**IMAGE, **FLAT},
                  {'S': {k: (v * 255).astype('uint8') for k, v in BANDS.items()},
                   **{k: (v * 255).astype('uint8') for k, v in FLAT.items()}}):
        with np.errstate(all='ignore'):
            old, new = _old_eval(expression, image), evaluate(expression, image)
        assert np.array_equal(old, new, equal_nan=True)
        assert np.asarray(old).dtype == np.asarray(new).dtype


def test_demo_views_parse(project):
    for view in project['views'].values():
        for expression in view.get('data', []):
            parse(expression)


def test_source_named_like_a_function_is_still_a_source():
    assert evaluate('$max.B1', {'max': {'B1': np.ones((2, 2))}}).sum() == 4


def test_unknown_band_and_bare_source():
    with pytest.raises(ExpressionError, match='Unknown band'):
        evaluate('$S.B99', IMAGE)
    with pytest.raises(ExpressionError, match='image source'):
        evaluate('$S', IMAGE)


def test_huge_integer_powers_do_not_hang():
    with pytest.raises(ExpressionError):
        evaluate('9**9**9**9', {})


def test_deep_and_long_expressions_are_rejected():
    with pytest.raises(ExpressionError):
        parse('-' * 500 + '1')
    with pytest.raises(ExpressionError):
        parse('1+' * 5000 + '1')


def test_image_route_reports_bad_expressions(client, logged_in_user, project, project_snapshot):
    project.config['views']['bad'] = {'name': 'bad', 'data': ['$Sentinel2.B1.tofile(1)']}
    response = client.get(f'/image/{project.image_ids[0]}/bad')
    assert response.status_code == 400
    assert client.get(f'/image/{project.image_ids[0]}/nope').status_code == 404
    assert client.get('/image/nope/RGB').status_code == 404
