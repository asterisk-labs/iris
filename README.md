# IRIS - Intelligently Reinforced Image Segmentation<sup>1</sup>
<sup>1</sup>Yes, it is a <a href="https://en.wikipedia.org/wiki/Backronym">backronym</a>.

<img src="preview/segmentation.png" />

Tool for manual image segmentation of satellite imagery. It was designed to accelerate the creation of machine learning training datasets for Earth Observation. IRIS is a static web page: everything runs in the browser, so it can be published on GitHub Pages or any web host, with no server to run. Special highlights:
* Support by AI (gradient boosted decision trees, trained in the browser) when doing image segmentation
* Multiple and configurable views for multispectral imagery, shown at their place on a map (MapLibre)
* Images read straight from Cloud Optimized GeoTIFFs (COG), wherever they are served: next to the page, on the Hugging Face Hub, on S3, ...
* Masks kept in the browser, or on the Hugging Face Hub for a team
* Accounts in an encrypted `credentials.json`, published with the page
* One configuration file per project ([guide](docs/config.md))

## Quick start

IRIS needs [Node.js](https://nodejs.org/) 22 or higher. Run the demo:

```bash
npx @asterisk-labs/iris demo
```

`npx` downloads IRIS when necessary; there is no separate install step. IRIS then opens the cloud demo from Hugging Face with two Sentinel-2 scenes to label. It is recommended to use a keyboard and mouse with scrollwheel for IRIS; the help (`?` in the top bar) lists the shortcuts.

To create an empty project folder and open it:

```bash
npx @asterisk-labs/iris init my-project
npx @asterisk-labs/iris my-project
```

Edit `my-project/project.json` ([guide](docs/config.md)), put each COG at `my-project/images/<id>/image.tif` and list the ids in `my-project/images.json`. IRIS only serves the files of the folder to your browser; the masks stay in the browser, and you download them from your profile. `npx @asterisk-labs/iris --help` lists the options (`--port`, `--host`, `--no-open`).

The same page is published at https://asterisk.coop/iris/. Its example projects live together in the public [asterisk-labs/iris-datasets](https://huggingface.co/datasets/asterisk-labs/iris-datasets) dataset.

## How a site is put together

The page reads `iris.json` next to it. It can contain a catalog so people choose a dataset before they sign in:

```json
{
  "default": "clouds",
  "allow_custom_projects": true,
  "projects": [
    {
      "id": "clouds",
      "name": "Cloud segmentation",
      "description": "Label clouds in Sentinel-2 scenes.",
      "thumbnail": "https://huggingface.co/datasets/my-org/iris-datasets/resolve/main/clouds/images/coast/thumbnail.png",
      "tags": ["Sentinel-2"],
      "project": "hf://datasets/my-org/iris-datasets/clouds/project.json",
      "labels": "hf://datasets/my-org/iris-datasets/clouds",
      "login": "huggingface",
      "guests": true,
      "admin": { "username": "admin", "password": "admin" }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `projects` | Projects shown on the start page. The old single-project `iris.json` format remains supported. |
| `default` | The project selected when an old direct link does not name one. |
| `allow_custom_projects` | Whether the start page accepts a project path entered by the user. |
| `id`, `name`, `description`, `thumbnail`, `tags` | The identity and presentation of a project in the catalog. |
| `project` | The project file ([guide](docs/config.md)), a path relative to the page or a Hugging Face path. Required. |
| `labels` | Where the masks go, a bucket `hf://buckets/<owner>/<name>` or a dataset `hf://datasets/<owner>/<name>`. By default, when the project is on Hugging Face, the masks go next to the project file, under `segmentation/`. Otherwise they stay in each user's browser. |
| `login` | Set to `"huggingface"` to let each user sign in with their own token. The token identifies the user and remains in that browser tab's session. |
| `admin` | The administrator account for the review and the project settings. The default is `admin` / `admin`: change it in your fork. It holds no Hugging Face token and is not a security boundary. |
| `credentials` | The accounts, see [Accounts](#accounts). Without it there are no accounts: whoever opens the page is the user `local`, an admin. |
| `guests` | Whether people can enter without an account (default `true`). Their masks stay in their browser. |

The paths in the project file are relative to the project file, so a project and its images can live together in one folder. The ids of the images are listed in `images.json` next to the project file, or in the project file itself (see the [guide](docs/config.md#images)). A single Hugging Face dataset can contain many IRIS projects:

```text
iris-datasets/
  cloud-demo/
    project.json
    images.json
    images/<image-id>/...
    segmentation/<image-id>/<user>_mask.tif
  flood-mapping/
    project.json
    images.json
    images/<image-id>/...
    segmentation/<image-id>/<user>_mask.tif
```

Point both `project` and `labels` at the corresponding folder. Images are read there and signed-in users' results are committed back to that same folder. Guests still save only in their browser.

The `iris.json` in [public](public) is published with the site. Edit it to point to your own project.

### Images

IRIS only reads Cloud Optimized GeoTIFFs: tiled, with a CRS, so that each image can be shown at its place on the map. You can create one with GDAL:

```bash
gdal_translate -of COG input.tif image.tif
```

The browser uses HTTP range requests to read the COGs, so the files must be served by a host that answers them (GitHub Pages, the Hugging Face Hub and S3 do) and, when they are on another site than the page, that allows it with CORS. IRIS currently decodes every band of the current image into browser memory. Large scenes should therefore be tiled or downsampled to a size appropriate for the users' devices.

### Data on the Hugging Face Hub

The project, the images and the masks can live on the [Hugging Face Hub](https://huggingface.co), written as paths:

```
hf://datasets/<owner>/<name>[@<revision>]/<path>
hf://buckets/<owner>/<name>/<path>
```

For example `"project": "hf://datasets/my-org/clouds/project.json"`. Public datasets are read by anyone; private ones need the token of the user who signed in. The masks are written with the token of the user, as files laid out per image:

```
segmentation/<image>/<user>_mask.tif   the mask: a COG of the mask area with two bands,
                                       the class of each pixel and whether the user drew it
segmentation/<image>/<user>.json       the notes about the image and when the mask was saved
```

In a bucket each save simply replaces the files. In a dataset each save is a commit. Before an upload starts, IRIS keeps the files in a durable browser outbox; a failed upload can therefore be retried after reloading the page.

### Accounts

The simplest shared setup uses `"login": "huggingface"`. Each person enters their own personal token; IRIS verifies it with Hugging Face, uses the corresponding HF account name on saved masks, and sends that token only to Hugging Face. Public data is readable without a token, but writing still requires the user's token to have write access to the dataset or bucket and its organization.

The default `iris.json` sets `"admin": { "username": "admin", "password": "admin" }`. Change it in your fork. The login page never shows it, but anyone can read it in `iris.json`, so it only opens the review and the project settings: it holds no Hugging Face token, and project edits are downloaded instead of written to the Hub.

For teams that do not want users to enter tokens directly, `credentials.json` holds one entry per user, encrypted with a key derived from their name and password. Do not configure both `login` and `credentials`. The file shows no names and can be published with the site. Unlocking an entry gives the role of the user (`admin` or `annotator`) and their Hugging Face token, kept for the session of the browser tab.

Add and remove users with:

```bash
npm run credentials -- add <user> --role admin --file public/credentials.json
npm run credentials -- remove <user> --file public/credentials.json
```

The script asks for the password (or reads `IRIS_PASSWORD`) and reads the user's Hugging Face token from `HF_TOKEN`. Anyone who knows a password can read the token in that entry, so give each user a [fine-grained token](https://huggingface.co/docs/hub/security-tokens) limited to the project's dataset and bucket, and long random passwords (at least 16 characters).

Accounts are intended for a trusted team. Because IRIS has no server, roles control the interface but cannot enforce authorization: a user can access their own decrypted token and perform anything that token permits. Tokens must therefore grant only the minimum repositories and operations that user needs. If users must be isolated from one another, place an authenticated service in front of the storage instead of publishing tokens in `credentials.json`.

### Masks, review and export

Users save their masks with the save button or by going to another image. From their profile they can download all their masks as files. The export button makes a GeoTIFF of the current image with its mask.

Admins have a Review button: who annotated each image, their notes, how well their masks agree, and the GeoTIFFs of the masks merged by majority. Admins also edit the project in the preferences: when the project file is in a dataset and their token can write to it, it is saved there; otherwise the edited file is downloaded, to replace the old one with.

## Publishing on GitHub Pages

The workflow [pages.yml](.github/workflows/pages.yml) builds the site and publishes it on every push to `serverless` (or when run by hand). In the settings of the repository, under Pages, choose GitHub Actions as the source. The site is then `public/` (with `iris.json`, brand assets and any `credentials.json`) plus the page built by Vite. The imagery remains on Hugging Face and is not copied into the deployment.

When the repository is `asterisk-labs/iris`, the organization site's custom domain is inherited and the project is published at `https://asterisk.coop/iris/`. The project repository must not set its own `CNAME`; the domain remains owned by `asterisk-labs/asterisk-labs.github.io`.

To publish it elsewhere, build it and copy `dist/` to any web host:

```bash
npm run build
```

## Publishing on npm

Releases are published by [npm.yml](.github/workflows/npm.yml) with npm Trusted Publishing. The workflow uses GitHub's short-lived OIDC identity, so it does not need an `NPM_TOKEN` secret.

Configure the trusted publisher once in the settings of `@asterisk-labs/iris` on npm:

| Setting | Value |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `asterisk-labs` |
| Repository | `iris` |
| Workflow filename | `npm.yml` |
| Environment | Leave empty |

For each release, update the version in `package.json` and `package-lock.json`, merge that commit, then create a GitHub release whose tag is exactly `v<version>`, for example `v1.0.1`. Publishing the release runs the type checker and test suite, verifies that its tag matches the package version, builds the package and publishes it with public access.

Maintainers can still inspect a package locally before making the release:

```bash
npm test
npm run typecheck
npm pack --dry-run
```

The package contains the built page, a small empty-project template and the command line in `bin/`. The demo imagery stays on Hugging Face, so it is not duplicated in every npm download. The package has no runtime dependencies. A root `.npmrc` is ignored so a developer's local npm credentials cannot be committed accidentally.

## Development

```bash
git clone https://github.com/asterisk-labs/iris
cd iris
npm install
npm run dev          # Vite dev server on port 3000
npm run demo         # build, then serve the demo as npx does
npm test             # the tests (Vitest)
npm run typecheck    # TypeScript type checking
npm run build        # the site in dist/
npm run preview      # serve dist/
```

The code is in [src](src): the raster engine that reads the COGs and renders the views in a web worker ([src/raster](src/raster)), the AI ([src/ai](src/ai)), the editor ([src/segmentation](src/segmentation), [src/stores](src/stores)), where the project and the masks are read and written ([src/services](src/services)) and the interface ([src/components](src/components)).

**Visit the official iris Github page: https://github.com/ESA-PhiLab/iris**
