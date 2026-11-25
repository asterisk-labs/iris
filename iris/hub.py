"""Download IRIS projects from the Hugging Face Hub.

A project on the Hub is written as hf://datasets/<owner>/<name>[@<revision>]/<path to project file>.
"""
import os
from pathlib import Path
from urllib.parse import quote

import requests

HUB = "https://huggingface.co"


def parse(location):
    """Split an hf:// location into the repository, the revision and the path."""
    parts = location.removeprefix("hf://").split("/")
    if len(parts) < 4 or parts[0] != "datasets":
        raise ValueError(f"'{location}' is not a file of a dataset, write hf://datasets/<owner>/<name>/<path>")
    name, _, revision = parts[2].partition("@")
    return f"{parts[1]}/{name}", revision or "main", "/".join(parts[3:])


def download_project(location, target=None):
    """Download the folder of a project file and return the local project file.

    The folder goes to ./<folder name> unless a target is given. Files that are
    already there with the same size are not downloaded again.
    """
    repo, revision, path = parse(location)
    folder, _, filename = path.rpartition("/")
    target = Path(target or folder.rpartition("/")[2] or repo.split("/")[1])
    revision = quote(revision, safe="")
    token = os.environ.get("HF_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    url = f"{HUB}/api/datasets/{repo}/tree/{revision}/{folder}".rstrip("/") + "?recursive=true"
    while url:
        listing = requests.get(url, headers=headers, timeout=60)
        listing.raise_for_status()
        for entry in listing.json():
            relative = entry["path"].removeprefix(folder).lstrip("/")
            # segmentation/ holds the masks saved by the web version of IRIS
            if entry["type"] != "file" or relative.startswith("segmentation/"):
                continue
            local = target / relative
            if local.exists() and local.stat().st_size == entry["size"]:
                continue
            print(f"Downloading {entry['path']}")
            local.parent.mkdir(parents=True, exist_ok=True)
            file_url = f"{HUB}/datasets/{repo}/resolve/{revision}/{quote(entry['path'])}"
            with requests.get(file_url, headers=headers, stream=True, timeout=60) as response:
                response.raise_for_status()
                with open(local, "wb") as stream:
                    for chunk in response.iter_content(1 << 20):
                        stream.write(chunk)
        url = listing.links.get("next", {}).get("url")

    return target / filename
