"""Take care of holding the current project's configurations

"""
import json
import os
import re
from copy import deepcopy
from glob import glob
from numbers import Number
from os.path import basename, dirname, exists, getmtime, isabs, join, normpath
from pprint import pprint

import markupsafe
import matplotlib
import numpy as np
import rasterio as rio
import yaml
from skimage.filters import sobel
from skimage.io import imread
from skimage.segmentation import felzenszwalb

from iris.imagecache import DEFAULT_CACHE_MB, ImageCache
from iris.utils import merge_deep_dicts


class Project:
    def __init__(self):
        # Each user is going to get a personalised random sequence of images:
        self.random_state = np.random.RandomState(seed=0)
        self.image_order = None
        self.image_ids = None
        self.file = None
        self.debug = False
        # images.shape as written in the config file (None when derived)
        self.configured_shape = None
        self._shape_cache = {}
        # Band counts per image file, keyed on (path, mtime)
        self._band_count_cache = {}
        # Loaded band arrays, see iris.imagecache. Sized from images.cache_mb
        # once a config is loaded.
        self._image_cache = ImageCache.from_mb(DEFAULT_CACHE_MB)

    def load_from(self, filename):
        if not isabs(filename):
            filename = join(os.getcwd(), filename)
        self.file = filename

        if not filename.endswith('json') or filename.endswith('yaml'):
            raise Exception('[CONFIG] config file must be in JSON or YAML format!')

        # Load the project config:
        try:
            with open(filename) as stream:
                if filename.endswith('json'):
                    self.config = json.load(stream)
                elif filename.endswith('yaml'):
                    self.config = yaml.safe_load(stream)
        except Exception as error:
            raise Exception('[CONFIG] Error in config file: '+ str(error)) from error

        # Load default config:
        with open(join(dirname(__file__), "default_config.json")) as stream:
            self.config = merge_deep_dicts(
                json.load(stream), self.config
            )

        if 'name' not in self.config:
            self.config['name'] = ".".join(basename(filename).split(".")[:-1])

        # Normalise images.path: if a single string was provided in the
        # project JSON, convert it into a dictionary so downstream code that
        # expects a mapping will work consistently (use key 'pictures').
        try:
            if 'images' in self.config and isinstance(self.config['images'].get('path', None), str):
                self.config['images']['path'] = { 'pictures': self.config['images']['path'] }
        except Exception as e:
            # Non-fatal; leave config as-is on error
            print(f"Warning: Failed to normalize images.path: {e}")

        self._init_paths_and_files(filename)

        # Default seed
        self.set_image_seed(0)

        # A reload may point at different images: start the caches afresh,
        # sized from the new config.
        self._shape_cache = {}
        self._band_count_cache = {}
        self._image_cache = ImageCache.from_mb(
            self.config['images'].get('cache_mb', DEFAULT_CACHE_MB)
        )

        self._init_image_shape()

        if self.segmentation:
            # mask_area is optional; without it the whole image is the mask
            # area, per image (images may differ in size).
            area = self['segmentation'].get('mask_area')
            if area is not None:
                self._check_mask_area(area)
            self.config['segmentation']['mask_area'] = area
            self.config['segmentation']['mask_shape'] = \
                self.get_mask_shape(self.image_ids[0])

            format = basename(self['segmentation']['path']).split('.')[-1].lower()
            encodings = {
                'npy': ['integer', 'binary', 'rgb', 'rgba'],
                'tif': ['integer', 'rgb', 'rgba'],
                'png': ['integer', 'rgb', 'rgba'],
                'jpg': ['rgb'],
                'jpeg': ['rgb'],
            }

            if format not in encodings:
                raise Exception(
                    f"Unknown format for mask: '{format}'! Allowed are: "
                    + ",".join(encodings)
                )
            encoding = self['segmentation']['mask_encoding']
            if encoding not in encodings[format]:
                raise Exception(
                    f"Mask format '{format}' does not allow '{encoding}' encoding! Allowed are: "
                    + ",".join(encodings[format])
                )

            if self['segmentation']['score'] not in ['f1', 'jaccard', 'accuracy']:
                raise Exception('Unknown segmentation score!', self['segmentation']['score'])

        # Make sure the HTML is understood in the descriptions:
        for name, view in self.config['views'].items():
            view['name'] = name
            view['description'] = markupsafe.Markup(
                view.get('description', view['name'])
            )
            view['stretch'] = view.get('stretch', 'linear')
            if 'data' in view and isinstance(view['data'], str):
                # a single channel image:
                view['data'] = [view['data']]
                view['cmap'] = view.get('cmap', 'jet')

        self._normalise_classes(self.config)
        for mode in ['segmentation', 'classification', 'detection']:
            if mode in self.config:
                self._normalise_classes(self[mode])

        if "host" not in self.config:
            self['host'] = '127.0.0.1'
        if "port" not in self.config:
            self['port'] = 5000
        if "debug" not in self.config:
            self['debug'] = False

    def __getitem__(self, key):
        return self.config[key]

    def __setitem__(self, key, value):
        self.config[key] = value

    def _normalise_classes(self, data):
        if "classes" not in data:
            return

        for klass in data['classes']:
            klass['css_colour'] = f'rgba({str(klass["colour"])[1:-1]})'

    def _init_paths_and_files(self, filename):
        default_path = join(dirname(filename), self.config['name']+'.iris')
        if 'path' not in self.config:
            self.config['path'] = default_path
        else:
            self.config['path'] = self.make_absolute(self.config['path'])
            # Until November 2026 a configured path was ignored (the check
            # above compared the Project object with the config keys), so
            # projects that set one may have data in the default folder.
            if (normpath(self.config['path']) != normpath(default_path)
                    and exists(default_path)):
                print(
                    f"[CONFIG] Warning: using path '{self.config['path']}' "
                    f"from the project file, but '{default_path}' also "
                    "exists. Masks, user configs and the database are read "
                    "from the configured path; move the folder if the "
                    "default one holds your data."
                )

        if self.segmentation and not self['segmentation']['path']:
            self.config['segmentation']['path'] = join(
                self['path'], 'segmentation', '{id}', 'mask.png'
            )

        # create the project path and the user configuration path
        os.makedirs(self['path'], exist_ok=True)
        os.makedirs(join(self['path'], 'user_config'), exist_ok=True)

        # Make all paths absolute:
        self['images']['path'] = self.make_absolute(self['images']['path'])
        self['images']['thumbnails'] = self.make_absolute(
            self['images'].get('thumbnails', False)
        )
        self['images']['metadata'] = self.make_absolute(
            self['images'].get('metadata', False)
        )
        if self.segmentation:
            self['segmentation']['path'] = self.make_absolute(
                self['segmentation']['path']
            )

        if isinstance(self['images']['path'], dict):
            image_paths = list(self['images']['path'].values())[0]
        else:
            image_paths = self['images']['path']

        # We will need to extract the image id by using regex. Compile it here
        # to get a better perfomance:
        before, id_str, after = image_paths.partition("{id}")
        if not id_str:
            raise Exception('[CONFIG] images:path must contain exactly one placeholder "{id}"!')
        escaped_path = re.escape(before)
        escaped_path += "(?P<id>.+)"
        escaped_path += re.escape(after)
        regex_images = re.compile(escaped_path)

        images = glob(image_paths.format(id="*"))
        if not images:
            raise Exception(
                f"[CONFIG] No images found in '{image_paths.format(id='*')}'.\n"
                "Did you set images:path to a valid, existing path?")

        try:
            self.image_ids = sorted([
                regex_images.match(image_path).groups()[0]
                for image_path in images
            ])
        except Exception as err:
            raise Exception(
                f'[ERROR] Could not extract id\nfrom path"{image_paths}"\nwith regex "{regex_images}"!'
            ) from err


    def make_absolute(self, path):
        """Make path absolute relatively from project path"""
        if isinstance(path, dict):
            return {
                k: self.make_absolute(v)
                for k, v in path.items()
            }
        elif isinstance(path, list):
            return list(map(self.make_absolute, path))

        if not path or isabs(path):
            return path
        else:
            return normpath(join(dirname(self.file), path))

    @property
    def segmentation(self):
        return 'path' in self.config.get('segmentation', [])

    def _init_image_shape(self):
        """Derive images.shape from the first image and check any configured value.

        `images.shape` in the config is optional. When present it must be
        `[height, width]` (numpy order) and match the first image; the
        value kept in `self.config` is always the derived `[height, width]`.
        """
        self._shape_cache = {}
        configured = self.config['images'].get('shape')
        self.configured_shape = list(configured) if configured else None
        try:
            height, width = self.get_image_shape(self.image_ids[0])
        except Exception as error:
            if configured:
                # Unreadable first image but a shape was given: trust it,
                # the error will surface when the image is rendered.
                print(f"Warning: could not read the size of image "
                      f"'{self.image_ids[0]}' ({error}); using images.shape")
                height, width = int(configured[0]), int(configured[1])
                self._shape_cache[self.image_ids[0]] = (height, width)
            else:
                raise Exception(
                    f"[CONFIG] Could not read image '{self.image_ids[0]}' to "
                    f"determine images.shape: {error}"
                ) from error
        if configured:
            conf = [int(configured[0]), int(configured[1])]
            if conf != [height, width]:
                hint = ''
                if conf == [width, height]:
                    hint = (' It looks like [width, height]; images.shape is'
                            ' [height, width], and may simply be left out.')
                raise Exception(
                    f"[CONFIG] images.shape {conf} does not match the first "
                    f"image '{self.image_ids[0]}', which is "
                    f"[{height}, {width}] (height, width).{hint}"
                )
        self.config['images']['shape'] = [height, width]

    def _check_mask_area(self, area):
        if (not isinstance(area, (list, tuple)) or len(area) != 4
                or area[2] <= area[0] or area[3] <= area[1]):
            raise Exception(
                '[CONFIG] segmentation.mask_area must be [x0, y0, x1, y1] '
                f'with x1 > x0 and y1 > y0, got {area}'
            )

    def get_image_shape(self, image_id):
        """(height, width) of an image, read from the file header and cached."""
        if image_id in self._shape_cache:
            return self._shape_cache[image_id]
        path = self.get_image_path(image_id)
        if isinstance(path, dict):
            path = list(path.values())[0]
        lower = path.lower()
        if lower.endswith('npy'):
            array = np.load(path, mmap_mode='r', allow_pickle=False)
            shape = (int(array.shape[0]), int(array.shape[1]))
        elif lower.endswith(('.tif', '.tiff', '.vrt')):
            with rio.open(path) as file:
                shape = (int(file.height), int(file.width))
        else:
            array = imread(path)
            shape = (int(array.shape[0]), int(array.shape[1]))
        self._shape_cache[image_id] = shape
        return shape

    def count_image_bands(self, filename):
        """Number of bands in one image file, read from its header.

        Cached per (path, mtime). npy files are memory-mapped so only the
        header is touched; GDAL formats come from the dataset metadata.
        Other formats fall back to reading the image.
        """
        key = (filename, getmtime(filename))
        if key in self._band_count_cache:
            return self._band_count_cache[key]
        lower = filename.lower()
        if lower.endswith('npy'):
            array = np.load(filename, mmap_mode='r', allow_pickle=False)
            count = 1 if array.ndim == 2 else int(array.shape[-1])
        elif lower.endswith(('.tif', '.tiff', '.vrt')):
            with rio.open(filename) as file:
                count = int(file.count)
        else:
            array = imread(filename)
            count = 1 if array.ndim == 2 else int(array.shape[-1])
        self._band_count_cache[key] = count
        return count

    def get_mask_area(self, image_id):
        """[x0, y0, x1, y1] of the mask area for an image.

        The configured `segmentation.mask_area` when set, otherwise the
        whole image.
        """
        area = self.config.get('segmentation', {}).get('mask_area')
        if area is not None:
            return list(area)
        height, width = self.get_image_shape(image_id)
        return [0, 0, width, height]

    def get_mask_shape(self, image_id):
        """(width, height) of the mask for an image."""
        x0, y0, x1, y1 = self.get_mask_area(image_id)
        return (x1 - x0, y1 - y0)

    def get_start_image_id(self):
        return self.image_ids[self.image_order[0]]

    def load_image(self, filename, bands=None):
        """Load image from file

        Args:
            filename:
            bands: Defines which bands to load from file. Must be a list of
                names starting with $, e.g. "$B1" or "$Sentinel2.B1"

        Returns:
            Returns a dictionary with the band names as keys and band array as
            value.
        """
        # The user uses band identifiers (like 'B1', etc):
        if bands is not None:
            bands = [int(s.replace("$B", ""))-1 for s in bands]

        if filename.lower().endswith('npy'):
            array = np.load(filename, mmap_mode='r', allow_pickle=False)
            if bands is not None:
                array = array[..., bands]
        elif filename.lower().endswith(('.tif', '.tiff', '.vrt')):
            # Let GDAL decode compressed tiles on all cores: a 64-band zstd
            # tile went from 1.2 s to 0.04 s with this.
            with rio.Env(GDAL_NUM_THREADS='ALL_CPUS'), rio.open(filename) as file:
                if bands is not None:
                    rio_bands = [b + 1 for b in bands]
                    array = file.read(rio_bands)
                else:
                    array = file.read()
                array = np.moveaxis(array, 0, -1)
        else:
            array = imread(filename)
            if len(array.shape) == 2:
                array = array[:,:,np.newaxis]
            if bands is not None:
                array = array[..., bands]

        if bands is None:
            bands = list(range(array.shape[-1]))

        data = {
            f"B{b+1}": array[..., i]
            for i, b in enumerate(bands)
        }
        return data

    def _load_image_cached(self, image_id, source, filename, bands):
        """load_image through the image cache.

        Keyed on the image, the source file id, the exact band selection
        and the file's mtime, so a rewritten file is read again. The
        returned arrays are shared and read-only; copy before writing.
        """
        key = (
            image_id, source,
            None if bands is None else tuple(bands),
            getmtime(filename),
        )
        return self._image_cache.get_or_load(
            key, lambda: self.load_image(filename, bands=bands)
        )

    def get_image(self, image_id, bands=None):
        """Get the image data as dictionary

        Args:
            image_id: Id of the image as string.
            bands: Bands of the image file (or files) to select, e.g. "$B1" or
                "$Sentinel2.B1".

        Returns:
            A dict with bands. The keys are either "$B1"..."$Bn" or
            "$FileIdentifier.B1". The arrays come from the image cache and
            are read-only.
        """

        if isinstance(self['images']['path'], dict):
            data = {}
            for file_id, filename in self['images']['path'].items():
                if bands is None:
                    file_bands = None
                else:
                    file_bands = [
                        band.replace(file_id+'.', '')
                        for band in bands
                        if band.startswith('$'+file_id+'.')
                    ]
                    if not file_bands:
                        continue

                image = self._load_image_cached(
                    image_id, file_id, filename.format(id=image_id),
                    file_bands
                )
                data[file_id] = image
        else:
            data = self._load_image_cached(
                image_id, None, self['images']['path'].format(id=image_id),
                bands
            )
            data = {
                '$'+key: value
                for key, value in data.items()
            }

        return data

    def get_image_bands(self, image_id):
        """Band names of an image, "$B1".."$Bn" or "$File.B1".., from the
        file headers; no pixels are read."""
        path = self.get_image_path(image_id)
        if isinstance(path, dict):
            bands = []
            for file_id, filename in path.items():
                count = self.count_image_bands(filename)
                bands.extend(f'${file_id}.B{i+1}' for i in range(count))
            return bands
        count = self.count_image_bands(path)
        return [f'$B{i+1}' for i in range(count)]

    def get_image_path(self, image_id):
        if isinstance(self['images']['path'], dict):
            return {
                k: v.format(id=image_id)
                for k, v in self['images']['path'].items()
            }
        else:
            return self['images']['path'].format(id=image_id)

    def render_image(self, image_id, view):
        # Find all required variables
        bands = re.findall(r'(?:\$\w+\.{0,1}\w+)', ";".join(view['data']))
        image = self.get_image(image_id, bands=bands)
        environment = self._get_render_environment(image)

        rgb_bands = []
        for i, expression_raw in enumerate(view['data']):
            expression = re.sub(r'\$(\w+)\.(\w+)', r'\1["\2"]', expression_raw)
            expression = re.sub(r'\$(\w+)', r'\1', expression)
            try:
                # Since one should never rely on evaluating an expression from
                # untrusted sources, we will have to find a different solution
                # to make it safe.
                self._check_band_expression(expression)
                rgb_bands.append(
                    eval(expression, {"__builtins__": None}, environment)
                )
            except Exception as error:
                print(
                    f"Could not parse {i}th expression of {view['name']}\n",
                    f"Raw expression: {expression_raw}\n",
                    f"Python expression: {expression}\n",
                    f"Error: {error}\n",
                    "Environment:"
                )
                pprint(environment)

        # Broadcast (single numbers are converted to an array with the size of
        # this image)
        shapes = [b.shape[:2] for b in rgb_bands if isinstance(b, np.ndarray)]
        shape = shapes[0] if shapes else self.get_image_shape(image_id)
        for i, band in enumerate(rgb_bands):
            if isinstance(band, Number):
                band = np.full(shape, band, dtype=float)

            rgb_bands[i] = band

        # Stretch between 0->1, with percentile clip if specified in view
        if 'clip' in view:
            if 'vmin' in view or 'vmax' in view:
                raise ValueError("Cannot specify both 'clip' and 'vmin'/'vmax' in view")
            clip = float(view['clip'])
            def linear_scale(z):
                return np.clip(
                            (z - np.percentile(z,clip))/(np.percentile(z,100-clip)-np.percentile(z,clip)),
                            0,
                            1
                            )
        elif 'vmin' in view or 'vmax' in view:
            if 'vmin' in view and 'vmax' in view:
                def linear_scale(z):
                    return np.clip((z - view['vmin'])/(view['vmax']-view['vmin']), 0, 1)
            elif 'vmin' in view:
                def linear_scale(z):
                    return np.clip((z - view['vmin'])/(z.max()-view['vmin']), 0, 1)
            elif 'vmax' in view:
                def linear_scale(z):
                    return np.clip((z - z.min())/(view['vmax']-z.min()), 0, 1)
        else:
            def linear_scale(z):
                return (z - z.min())/(z.max()-z.min())
        rgb_bands = list(map(linear_scale, rgb_bands))

        if len(rgb_bands) == 1:
            # matplotlib.colormaps raises KeyError on an unknown name where
            # cm.get_cmap (gone in Matplotlib 3.11) raised ValueError
            rgb_bands = matplotlib.colormaps[view['cmap']](rgb_bands)[..., :3]

        rgb_bands = np.dstack(rgb_bands)
        return (255*rgb_bands).astype('uint8')

    def _get_render_environment(self, image):
        return {
            'max': np.max,
            'min': np.min,
            'mean': np.mean,
            'median': np.median,
            'log': np.log,
            'exp': np.exp,
            'sin': np.sin,
            'cos': np.cos,
            'PI': np.pi,
            'edges': sobel,
            'superpixels': felzenszwalb,
            **{
                key.strip('$'): value
                for key, value in image.items()
            },
        }

    def _check_band_expression(self, expression):
        forbidden_tokens = ['lambda', '__', 'except', 'eval', ';']

        for forbidden in forbidden_tokens:
            if forbidden in expression:
                raise Exception(
                    f"'{forbidden}' is not allowed in band expressions!\n"
                    + f"Expression: {expression}"
                )

    def get_metadata(self, image_id):
        filename = self['images'].get('metadata', False)
        if not filename:
            return {}

        filename = filename.format(id=image_id)

        with open(filename) as stream:
            if filename.endswith('json'):
                metadata = json.load(stream)
            elif filename.endswith('yaml'):
                metadata = yaml.safe_load(stream)
            else:
                return {"__body__": stream.read()}

        return metadata

    def get_thumbnail(self, image_id):
        filename = self['images'].get('thumbnails', False)
        if not filename:
            return None

        return imread(filename.format(id=image_id))

    def get_user_config(self, user_id):
        filename = join(self['path'], 'user_config', f'{user_id}.json')
        config = deepcopy(self.config)

        # Only if the user config is newer the system's config file, we use it
        # for updates:
        if exists(filename) and getmtime(self.file) <= getmtime(filename):
            with open(filename) as stream:
                user_config = json.load(stream)

            config = merge_deep_dicts(config, user_config)
            # Actually, it would be a security risk to allow some options to be
            # set by the user (or by a potential attacker):
            config['images'] = deepcopy(self.config['images'])
            config['views'] = deepcopy(self.config['views'])
            if "path" in self.config['segmentation']:
                config['segmentation']['path'] = self.config['segmentation']['path']

        return config

    def save_user_config(self, user_id, user_config):
        filename = join(self['path'], 'user_config', f'{user_id}.json')

        with open(filename, 'w') as stream:
            json.dump(user_config, stream)

    def get_next_image(self, image_id, user_id):

        original_index = self.image_ids.index(image_id)
        index = self.image_order.index(original_index)

        # 'prioritise_unmarked_images' mode will search the database of existing
        # masks, and find images with the lowest number of annotations to serve
        # when a user asks for the next image. Then it will swap this image
        # into the existing order to make it come up next.
        if self.config['segmentation']['prioritise_unmarked_images']:
            from iris.models import Action
            actions = Action.query.all()
            # Same order as self.image_order (NOT self.image_ids)
            mask_count = [0]*len(self.image_order)
            mask_count[index] = 99999 # Make sure the current image isn't selected as the new one
            for action in actions:
                mask_count[
                    self.image_order.index(
                        self.image_ids.index(
                            action.image_id
                            )
                            )
                            ] += 1

                if user_id.id == action.user_id:
                    mask_count[
                        self.image_order.index(
                            self.image_ids.index(
                                action.image_id
                                )
                                )
                                ] += 9999

            min_labellers = min(mask_count)
            # iterate through images until one is found with fewest existing masks
            next_image_found = False
            trial_idx = index
            while not next_image_found:
                trial_idx = (trial_idx + 1) % len(self.image_order)
                if mask_count[trial_idx] == min_labellers and trial_idx != index:
                    # Once a suitable image is found, update the list so that its
                    # next in line (this means self.get_previous_image retains expected
                    # behaviour immediately afterwards).
                    # NOTE: this mutates self.image_ids, which every user
                    # shares, so one user's "next" reorders the others'
                    # sequences. The ordering rewrite in T1.2.1 of
                    # docs/agents/IMPLEMENTATION_PLAN.md replaces this; it is
                    # deliberately left alone here.
                    a = trial_idx
                    b = (index + 1) % len(self.image_order)
                    self.image_ids[self.image_order[a]], self.image_ids[self.image_order[b]] = \
                        self.image_ids[self.image_order[b]], self.image_ids[self.image_order[a]]
                    next_image_found = True
        index = (index + 1) % len(self.image_order)
        return self.image_ids[self.image_order[index]]

    def get_previous_image(self, image_id):
        original_index = self.image_ids.index(image_id)

        index = self.image_order.index(original_index)
        index = (index - 1) % len(self.image_order)
        return self.image_ids[self.image_order[index]]

    def set_image_seed(self, seed):
        self.random_state = np.random.RandomState(seed=seed)
        self.image_order = list(range(len(self.image_ids)))

        self.random_state.shuffle(self.image_order)

project = Project()
