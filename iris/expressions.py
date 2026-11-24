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
}
# Second and later positional arguments of numpy functions include `out`, so
# only these may take more than one.
MAX_POSITIONAL = {'superpixels': 4}
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
    """The `$B1` and `$Source.B1` references in a list of expressions."""
    return re.findall(r'(?:\$\w+\.{0,1}\w+)', ";".join(expressions))


def parse(expression):
    """Parse and check an expression; raises ExpressionError.

    Band names are not checked, since they depend on the image.
    """
    if not isinstance(expression, str):
        raise ExpressionError('A band expression must be a string')
    if len(expression) > MAX_LENGTH:
        raise ExpressionError(f'Expression is longer than {MAX_LENGTH} characters')
    source = re.sub(r'\$(?=\w)', '', expression).strip()
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
    # _check let nothing else through
    function = FUNCTIONS[node.func.id][0]
    return function(
        *[_evaluate(arg, bands) for arg in node.args],
        **{k.arg: _evaluate(k.value, bands) for k in node.keywords},
    )
