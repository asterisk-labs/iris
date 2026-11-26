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


# eval knew neither band ranges nor pca
@pytest.mark.parametrize('expression', [c for c in CASES['valid'] if 'pca' not in c])
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
    response = client.get(f'/api/v1/images/{project.image_ids[0]}/views/bad')
    assert response.status_code == 400
    assert client.get(f'/api/v1/images/{project.image_ids[0]}/views/nope').status_code == 404
    assert client.get('/api/v1/images/nope/views/RGB').status_code == 404



def test_band_ranges_are_spelt_out_for_loading():
    from iris.expressions import find_bands
    assert sorted(find_bands(['pca($S.B2:B4) + $S.B1'])) == ['$S.B1', '$S.B2', '$S.B3', '$S.B4']


def test_pca_of_a_range_is_three_channels_with_most_variance_first():
    rng = np.random.RandomState(0)
    signal = rng.normal(size=(8, 9))
    image = {'S': {f'B{i}': signal * i + rng.normal(scale=0.01, size=(8, 9)) for i in range(1, 13)}}
    out = evaluate('pca($S.B1:B12)', image)
    assert out.shape == (8, 9, 3)
    variance = out.reshape(-1, 3).var(0)
    assert variance[0] > 100 * variance[1] and variance[1] >= variance[2]
    # The first component follows the shared signal, with a fixed sign
    assert np.corrcoef(out[..., 0].ravel(), signal.ravel())[0, 1] > 0.99
    assert np.array_equal(out, evaluate('pca($S.B1:B12)', image))


def test_pca_takes_several_ranges_and_bands():
    out = evaluate('pca($S.B1:B5, $S.B7, $S.B9:B12)', IMAGE)
    assert out.shape == (8, 9, 3)


@pytest.mark.parametrize('expression, message', [
    ('pca($S.B1:B2)', 'at least three'),
    ('pca($S.B10:B14)', 'Unknown band B13'),
    ('$S.B5:B2', 'backwards'),
    ('_band_range(S, 1, 3)', 'not allowed'),
])
def test_bad_ranges_and_pca(expression, message):
    with pytest.raises(ExpressionError, match=message):
        evaluate(expression, IMAGE)


def test_a_pca_view_renders_as_rgb(tmp_path):
    from iris.project import Project
    p = Project()
    p.file = str(tmp_path / 'p.json')
    p.config = {'images': {'path': {'S': str(tmp_path / '{id}.npy')}}, 'views': {}, 'name': 'x'}
    np.save(str(tmp_path / '1.npy'), np.random.RandomState(1).rand(10, 12, 6).astype(np.float32), allow_pickle=False)
    p.image_ids = ['1']
    out = p.render_image('1', {'name': 'p', 'data': ['pca($S.B1:B6)'], 'cmap': 'jet', 'clip': 2})
    assert out.shape == (10, 12, 3) and out.dtype == np.uint8
    assert len(np.unique(out.reshape(-1, 3), axis=0)) > 50


def test_a_band_range_needs_pca():
    with pytest.raises(ExpressionError, match='only be used inside pca'):
        evaluate('$S.B1:B5', IMAGE)
    with pytest.raises(ExpressionError):
        evaluate('$S.B1:B5 + 1', IMAGE)
