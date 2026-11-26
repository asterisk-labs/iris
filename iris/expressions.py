"""Evaluate the band expressions of views without `eval`.

An expression such as `edges($Sentinel2.B2 + $Sentinel2.B3) * 1.5` is parsed
with `ast` and walked node by node. Anything not handled here is rejected, so
an expression can read bands and call the functions in FUNCTIONS, and nothing
else: there is no attribute access on arrays, no subscripting, no strings and
no way to reach a Python object that was not put in the environment.
"""
import ast
import operator
import re
from numbers import Number

import numpy as np
from skimage.filters import sobel
from skimage.segmentation import felzenszwalb

MAX_LENGTH = 2000
MAX_DEPTH = 100

# Pixels used to fit a PCA; the projection then covers every pixel
PCA_SAMPLE = 20000
# $Source.B14:B77, every band from 14 to 77 of one source
RANGE = re.compile(r'\$(\w+)\.B(\d+):B(\d+)')


def pca(*bands):
    """The first three principal components of the given bands.

    Fitted on a fixed sample of the image's pixels, centred but not
    scaled, so bands with more variance count for more. Each component's
    sign is chosen so that its largest loading is positive, which keeps the
    colours from flipping between renders. Returns (height, width, 3).

    The projection runs band by band rather than on one stacked array,
    which for 64 bands of 1024 x 1024 would be a 256 MB copy.
    """
    planes = []
    for band in bands:
        if isinstance(band, BandRange):
            planes.extend(band)
            continue
        band = np.asarray(band)
        if band.ndim == 3:
            planes.extend(band[..., i] for i in range(band.shape[-1]))
        else:
            planes.append(band)
    if len(planes) < 3:
        raise ExpressionError('pca needs at least three bands')
    shape = planes[0].shape
    pixels = planes[0].size
    sample = np.random.RandomState(0).choice(pixels, min(PCA_SAMPLE, pixels), replace=False)
    x = np.stack([p.ravel()[sample] for p in planes], axis=-1).astype(np.float64)
    mean = x.mean(0)
    _, _, components = np.linalg.svd(x - mean, full_matrices=False)
    components = components[:3]
    components *= np.sign(components[np.arange(3), np.abs(components).argmax(1)])[:, None]
    out = np.zeros((3, pixels), np.float32)
    for k, plane in enumerate(planes):
        values = plane.ravel().astype(np.float32) - np.float32(mean[k])
        for c in range(3):
            out[c] += np.float32(components[c, k]) * values
    return np.moveaxis(out.reshape(3, *shape), 0, -1)


class BandRange(tuple):
    """The 2D bands of $Source.B1:B9, kept apart: only pca takes them, and
    stacking 64 bands into one array costs more than the PCA itself."""


def _band_range(source, first, last):
    """Bands first to last of a source."""
    if not isinstance(source, dict):
        raise ExpressionError('A band range needs an image source, e.g. $Sentinel2.B1:B13')
    missing = [b for b in range(first, last + 1) if f'B{b}' not in source]
    if missing:
        raise ExpressionError(f'Unknown band B{missing[0]} in the range B{first}:B{last}')
    return BandRange(source[f'B{b}'] for b in range(first, last + 1))


# name -> (function, allowed keyword arguments)
FUNCTIONS = {
    'max': (np.max, {'axis'}),
    'min': (np.min, {'axis'}),
    'mean': (np.mean, {'axis'}),
    'median': (np.median, {'axis'}),
    'log': (np.log, set()),
    'exp': (np.exp, set()),
    'sin': (np.sin, set()),
    'cos': (np.cos, set()),
    'edges': (sobel, {'axis'}),
    'superpixels': (felzenszwalb, {'scale', 'sigma', 'min_size'}),
    'pca': (pca, set()),
}
# Not callable by name in an expression: $Source.B1:B9 is turned into it
RANGE_FUNCTION = '_band_range'
# Second and later positional arguments of numpy functions include `out`, so
# only these may take more than one.
MAX_POSITIONAL = {'superpixels': 4, 'pca': 256}
CONSTANTS = {'PI': np.pi}


def _power(base, exponent):
    """`**`, refusing the integer towers that would exhaust memory."""
    integers = isinstance(base, int) and isinstance(exponent, int)
    if integers and (abs(base) > 2**32 or abs(exponent) > 64):
        return float(base) ** float(exponent)
    return base ** exponent


BINARY = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: _power,
    ast.BitAnd: operator.and_,
    ast.BitOr: operator.or_,
    ast.BitXor: operator.xor,
}
UNARY = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
    ast.Invert: operator.invert,
}
COMPARE = {
    ast.Lt: operator.lt,
    ast.LtE: operator.le,
    ast.Gt: operator.gt,
    ast.GtE: operator.ge,
    ast.Eq: operator.eq,
    ast.NotEq: operator.ne,
}


class ExpressionError(ValueError):
    """The expression is not valid or could not be evaluated."""


def find_bands(expressions):
    """The `$B1` and `$Source.B1` references in a list of expressions,
    with ranges such as `$Source.B1:B9` spelt out."""
    text = ";".join(expressions)
    ranges = [
        f'${source}.B{band}'
        for source, first, last in RANGE.findall(text)
        for band in range(int(first), int(last) + 1)
    ]
    return re.findall(r'(?:\$\w+\.{0,1}\w+)', RANGE.sub('', text)) + ranges


def parse(expression):
    """Parse and check an expression; raises ExpressionError.

    Band names are not checked, since they depend on the image.
    """
    if not isinstance(expression, str):
        raise ExpressionError('A band expression must be a string')
    if len(expression) > MAX_LENGTH:
        raise ExpressionError(f'Expression is longer than {MAX_LENGTH} characters')
    if RANGE_FUNCTION in expression:
        raise ExpressionError(f"'{RANGE_FUNCTION}' is not allowed in band expressions")
    for _, first, last in RANGE.findall(expression):
        if int(first) > int(last):
            raise ExpressionError(f'Band range B{first}:B{last} goes backwards')
    source = RANGE.sub(lambda m: f'{RANGE_FUNCTION}({m[1]}, {m[2]}, {m[3]})', expression)
    source = re.sub(r'\$(?=\w)', '', source).strip()
    try:
        tree = ast.parse(source, mode='eval').body
    except (SyntaxError, ValueError, MemoryError, RecursionError) as error:
        raise ExpressionError(f"Not a valid expression: '{expression}'") from error
    _check(tree, 0)
    return tree


def _check(node, depth):
    if depth > MAX_DEPTH:
        raise ExpressionError('Expression is nested too deeply')

    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return
        raise ExpressionError(f'{node.value!r} is not allowed in band expressions')
    if isinstance(node, ast.Name):
        return
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
        return
    if isinstance(node, ast.BinOp) and type(node.op) in BINARY:
        children = [node.left, node.right]
    elif isinstance(node, ast.UnaryOp) and type(node.op) in UNARY:
        children = [node.operand]
    elif (isinstance(node, ast.Compare) and len(node.ops) == 1
          and type(node.ops[0]) in COMPARE):
        children = [node.left, node.comparators[0]]
    elif isinstance(node, ast.Call):
        children = _check_call(node)
    else:
        raise ExpressionError(
            f'{type(node).__name__} is not allowed in band expressions'
        )
    for child in children:
        _check(child, depth + 1)


def _check_call(node):
    if isinstance(node.func, ast.Name) and node.func.id == RANGE_FUNCTION:
        # Made by parse from $Source.B1:B9; its arguments are fixed
        return []
    if not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS:
        raise ExpressionError(
            'Only these functions can be called: ' + ', '.join(FUNCTIONS)
        )
    name = node.func.id
    if not 1 <= len(node.args) <= MAX_POSITIONAL.get(name, 1):
        raise ExpressionError(f"Wrong number of arguments for '{name}'")
    allowed = FUNCTIONS[name][1]
    for keyword in node.keywords:
        if keyword.arg not in allowed:
            raise ExpressionError(f"'{name}' has no argument '{keyword.arg}'")
    return node.args + [keyword.value for keyword in node.keywords]


def evaluate(expression, image):
    """Evaluate an expression on the bands returned by Project.get_image."""
    bands = {key.strip('$'): value for key, value in image.items()}
    tree = parse(expression)
    try:
        result = _evaluate(tree, bands)
    except ExpressionError:
        raise
    except Exception as error:
        raise ExpressionError(f"Could not evaluate '{expression}': {error}") from error
    if isinstance(result, BandRange):
        raise ExpressionError(f"'{expression}': a band range can only be used inside pca(...)")
    if not isinstance(result, (np.ndarray, Number)):
        raise ExpressionError(f"'{expression}' is an image source, not a band")
    return result


def _evaluate(node, bands):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        if node.id in bands:
            return bands[node.id]
        if node.id in CONSTANTS:
            return CONSTANTS[node.id]
        raise ExpressionError(f"Unknown band '{node.id}'")
    if isinstance(node, ast.Attribute):
        source = bands.get(node.value.id)
        # Only a source's dict of bands: never an attribute of an object
        if not isinstance(source, dict) or node.attr not in source:
            raise ExpressionError(f"Unknown band '{node.value.id}.{node.attr}'")
        return source[node.attr]
    if isinstance(node, ast.BinOp):
        return BINARY[type(node.op)](
            _evaluate(node.left, bands), _evaluate(node.right, bands)
        )
    if isinstance(node, ast.UnaryOp):
        return UNARY[type(node.op)](_evaluate(node.operand, bands))
    if isinstance(node, ast.Compare):
        return COMPARE[type(node.ops[0])](
            _evaluate(node.left, bands), _evaluate(node.comparators[0], bands)
        )
    if node.func.id == RANGE_FUNCTION:
        source, first, last = node.args
        return _band_range(bands.get(source.id), first.value, last.value)
    # _check let nothing else through
    function = FUNCTIONS[node.func.id][0]
    return function(
        *[_evaluate(arg, bands) for arg in node.args],
        **{k.arg: _evaluate(k.value, bands) for k in node.keywords},
    )
