"""The schema of a project file.

These models are the one description of the project config. They validate it
(see `check_config`), and the TypeScript types in src/types/config.generated.ts
are generated from them with `python -m iris.schema`.

Defaults are not given here: they live in default_config.json, which is merged
into every project when it is loaded. Keys that are not in the schema are left
alone, so a project file may carry its own.
"""
import json
from pathlib import Path
from typing import Annotated, Literal, Optional, Union

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)

from iris.expressions import parse

TYPESCRIPT_FILE = Path(__file__).parent.parent / 'src' / 'types' / 'config.generated.ts'

ColourValue = Annotated[StrictInt, Field(ge=0, le=255)]
Colour = tuple[ColourValue, ColourValue, ColourValue, ColourValue]
Positive = Annotated[StrictInt, Field(gt=0)]
Number = Union[StrictInt, StrictFloat]


class _Model(BaseModel):
    model_config = ConfigDict(extra='ignore')


class ImagesConfig(_Model):
    path: Union[StrictStr, dict[str, StrictStr]]
    shape: Optional[tuple[Positive, Positive]] = Field(
        None, description='[height, width]; read from the images when absent')
    thumbnails: Union[StrictStr, dict[str, StrictStr], Literal[False], None] = None
    metadata: Union[StrictStr, dict[str, StrictStr], Literal[False], None] = None
    cache_mb: Optional[Annotated[Number, Field(ge=0)]] = Field(
        None, description='Budget of the image cache in megabytes; 0 disables it')


class ClassConfig(_Model):
    name: StrictStr
    colour: Colour = Field(description='RGBA, 0 to 255')
    user_colour: Optional[Colour] = None
    description: Optional[StrictStr] = None
    css_colour: Optional[StrictStr] = Field(
        None, description='Set by the server from colour')


class ViewConfig(_Model):
    type: Literal['image']
    data: Union[StrictStr, list[StrictStr]] = Field(
        description='One band expression, or three for red, green and blue')
    description: Optional[StrictStr] = None
    cmap: Optional[StrictStr] = None
    clip: Optional[Number] = None
    vmin: Optional[Number] = None
    vmax: Optional[Number] = None
    stretch: Optional[StrictStr] = None
    name: Optional[StrictStr] = Field(None, description='Set by the server from the key')

    @field_validator('data')
    @classmethod
    def _expressions(cls, data):
        expressions = data if isinstance(data, list) else [data]
        if len(expressions) not in (1, 3):
            raise ValueError('must be one band expression or three')
        for expression in expressions:
            parse(expression)
        return data


class AIModelConfig(_Model):
    bands: Optional[list[StrictStr]] = Field(None, description='null for all bands')
    train_ratio: Optional[Number] = None
    max_train_pixels: Optional[StrictInt] = None
    n_estimators: Optional[StrictInt] = None
    max_depth: Optional[StrictInt] = None
    n_leaves: Optional[StrictInt] = None
    n_jobs: Optional[StrictInt] = Field(
        None, description='Threads for LightGBM; -1 is all cores')
    use_edge_filter: Optional[StrictBool] = None
    use_superpixels: Optional[StrictBool] = None
    use_meshgrid: Optional[StrictBool] = None
    meshgrid_cells: Optional[StrictStr] = None
    suppression_threshold: Optional[Number] = None
    suppression_filter_size: Optional[StrictInt] = None
    suppression_default_class: Optional[StrictInt] = None

    @field_validator('n_jobs')
    @classmethod
    def _threads(cls, value):
        if value is not None and (value == 0 or value < -1):
            raise ValueError('must be a positive integer or -1 (all cores)')
        return value


class SegmentationConfig(_Model):
    path: StrictStr
    mask_encoding: Optional[Literal['integer', 'binary', 'rgb', 'rgba']] = None
    mask_area: Optional[tuple[StrictInt, StrictInt, StrictInt, StrictInt]] = Field(
        None, description='[x0, y0, x1, y1]; the whole image when absent')
    mask_shape: Optional[tuple[StrictInt, StrictInt]] = Field(
        None, description='[width, height], set by the server')
    score: Optional[Literal['f1', 'jaccard', 'accuracy']] = None
    prioritise_unmarked_images: Optional[StrictBool] = None
    unverified_threshold: Optional[StrictInt] = None
    ai_model: Union[AIModelConfig, Literal[False], None] = None


class ChatConfig(_Model):
    enabled: Optional[StrictBool] = None
    github_repo: Optional[StrictStr] = None
    utterances_theme: Optional[StrictStr] = None

    @model_validator(mode='after')
    def _repo_needed(self):
        if self.enabled and not (self.github_repo or '').strip():
            raise ValueError('github_repo is required when enabled is true')
        return self


class ProjectConfig(_Model):
    name: StrictStr
    host: Optional[StrictStr] = None
    port: Optional[Annotated[StrictInt, Field(ge=0, le=65535)]] = None
    debug: Optional[StrictBool] = None
    guests: Optional[StrictBool] = Field(
        None, description='Let people in as guests, without an account (default false)')
    path: Optional[StrictStr] = None
    images: ImagesConfig
    classes: Annotated[list[ClassConfig], Field(min_length=1)]
    views: Annotated[dict[str, ViewConfig], Field(min_length=1)]
    view_groups: Optional[dict[str, list[StrictStr]]] = None
    segmentation: SegmentationConfig
    chat: Optional[ChatConfig] = None

    @model_validator(mode='after')
    def _groups_name_views(self):
        for group, names in (self.view_groups or {}).items():
            for name in names:
                if name not in self.views:
                    raise ValueError(
                        f"view_groups.{group} references non-existent view '{name}'")
        return self


def without_bing(config):
    """The config without Bing views, and their names. Does not modify it."""
    views = config.get('views')
    if not isinstance(views, dict):
        return config, []
    bing = [
        name for name, view in views.items()
        if isinstance(view, dict) and view.get('type') == 'bingmap'
    ]
    if not bing:
        return config, []
    config = {**config, 'views': {k: v for k, v in views.items() if k not in bing}}
    groups = config.get('view_groups')
    if isinstance(groups, dict):
        config['view_groups'] = {
            group: [n for n in names if n not in bing] if isinstance(names, list) else names
            for group, names in groups.items()
        }
    return config, bing


def check_config(config):
    """Check a project config; returns (errors, warnings) as readable strings."""
    if not isinstance(config, dict):
        return ['The config must be an object'], []
    config, bing = without_bing(config)
    warnings = [
        f"views.{name}: Bing maps are no longer supported, so it is ignored"
        for name in bing
    ]
    images = config.get('images')
    path = images.get('path') if isinstance(images, dict) else None
    for p in path.values() if isinstance(path, dict) else [path]:
        if isinstance(p, str) and p and '{id}' not in p:
            warnings.append('images.path should contain the {id} placeholder')

    try:
        ProjectConfig.model_validate(config)
    except ValidationError as error:
        return _messages(error, config), warnings
    return [], warnings


def _messages(error, config):
    """One message per problem, with the path as written in the file."""
    messages = []
    for problem in error.errors():
        # Pydantic puts the tried member of a union into the path. Only keep
        # what is really in the config, plus a missing last key.
        path, value = [], config
        loc = problem['loc']
        for i, part in enumerate(loc):
            in_dict = isinstance(value, dict) and part in value
            in_list = isinstance(value, list) and isinstance(part, int) and part < len(value)
            if in_dict or in_list:
                value = value[part]
            elif not (problem['type'] == 'missing' and i == len(loc) - 1):
                continue
            path.append(str(part))
        # An object tried against the "or false" member says nothing useful
        if problem['type'] == 'literal_error' and isinstance(value, dict):
            continue
        text = problem['msg']
        if text.startswith('Value error, '):
            text = text[len('Value error, '):]
        for old, new in (('Input should be a valid list', 'must be an array'),
                         ('Input should be a valid tuple', 'must be an array'),
                         ('Input should be a valid dictionary', 'must be an object'),
                         ('Input should be', 'must be'),
                         ('Field required', 'is required')):
            text = text.replace(old, new)
        text = text.split(' or instance of ')[0]
        message = f"{'.'.join(path)}: {text}" if path else text
        if message not in messages:
            messages.append(message)
    return messages


# --- TypeScript generation ---

def _ts(schema):
    if '$ref' in schema:
        return schema['$ref'].rsplit('/', 1)[-1]
    if 'const' in schema:
        return json.dumps(schema['const'])
    if 'enum' in schema:
        return ' | '.join(json.dumps(v).replace('"', "'") for v in schema['enum'])
    if 'anyOf' in schema:
        options = []
        for option in map(_ts, schema['anyOf']):
            if option not in options:
                options.append(option)
        return ' | '.join(options)
    kind = schema['type']
    if kind == 'array':
        if 'prefixItems' in schema:
            return '[' + ', '.join(map(_ts, schema['prefixItems'])) + ']'
        item = _ts(schema['items'])
        return f'({item})[]' if '|' in item else f'{item}[]'
    if kind == 'object':
        return f"Record<string, {_ts(schema['additionalProperties'])}>"
    return {'integer': 'number'}.get(kind, kind)


def _ts_interface(name, schema):
    lines = [f'export interface {name} {{']
    required = schema.get('required', [])
    for key, field in schema['properties'].items():
        if 'description' in field:
            lines.append(f"  /** {field['description']} */")
        mark = '' if key in required else '?'
        type_ = _ts(field)
        if type_.startswith('"'):
            type_ = type_.replace('"', "'")
        lines.append(f'  {key}{mark}: {type_};')
    return '\n'.join(lines + ['}'])


def typescript():
    """The source of src/types/config.generated.ts."""
    schema = ProjectConfig.model_json_schema()
    interfaces = [
        _ts_interface(name, definition)
        for name, definition in sorted(schema['$defs'].items())
    ]
    interfaces.append(_ts_interface('ProjectConfig', schema))
    header = (
        '// Generated from iris/schema.py by `python -m iris.schema`. Do not edit.\n'
    )
    return header + '\n' + '\n\n'.join(interfaces) + '\n'


if __name__ == '__main__':
    TYPESCRIPT_FILE.write_text(typescript(), encoding='utf-8', newline='\n')
    print(f'Wrote {TYPESCRIPT_FILE}')
