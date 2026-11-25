import pytest

from iris import hub

FILES = {
    "demo/project.json": b'{"name": "demo"}',
    "demo/images/a/image.tif": b"tif",
    "demo/segmentation/a/mask.json": b"{}",
}


class Response:
    def __init__(self, url, links=None):
        self.url = url
        self.links = links or {}

    def raise_for_status(self):
        pass

    def json(self):
        if self.links:
            return [{"type": "directory", "path": "demo/images", "size": 0}]
        return [{"type": "file", "path": path, "size": len(data)} for path, data in FILES.items()]

    def iter_content(self, size):
        yield FILES[self.url.split("/resolve/main/")[1]]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


@pytest.fixture
def requests_get(monkeypatch):
    urls = []

    def get(url, **kwargs):
        urls.append(url)
        if "/api/" in url and "cursor" not in url:
            return Response(url, links={"next": {"url": url + "&cursor=2"}})
        return Response(url)

    monkeypatch.setattr(hub.requests, "get", get)
    return urls


def test_parse():
    assert hub.parse("hf://datasets/owner/name/demo/project.json") == ("owner/name", "main", "demo/project.json")
    assert hub.parse("hf://datasets/owner/name@v1/project.json") == ("owner/name", "v1", "project.json")
    with pytest.raises(ValueError):
        hub.parse("hf://models/owner/name/project.json")


def test_download_project(tmp_path, requests_get):
    project = hub.download_project("hf://datasets/owner/name/demo/project.json", tmp_path / "demo")

    assert project == tmp_path / "demo" / "project.json"
    assert project.read_bytes() == FILES["demo/project.json"]
    assert (tmp_path / "demo/images/a/image.tif").read_bytes() == b"tif"
    assert not (tmp_path / "demo/segmentation").exists()
    assert requests_get[0] == "https://huggingface.co/api/datasets/owner/name/tree/main/demo?recursive=true"

    # A second run finds the files and only lists the folder
    requests_get.clear()
    hub.download_project("hf://datasets/owner/name/demo/project.json", tmp_path / "demo")
    assert all("/api/" in url for url in requests_get)
