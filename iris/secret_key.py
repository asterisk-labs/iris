"""The key that signs login cookies, kept in the project folder.

Without it being kept, every restart of the server logs everyone out.
"""
import os
from pathlib import Path

LENGTH = 32


def load_secret_key(folder):
    """The project's key, created on first use and readable by its owner only.

    A folder that cannot be written to gets a key for this run only.
    """
    path = Path(folder) / 'secret_key'
    try:
        if not path.exists():
            _create(path)
        key = path.read_bytes()
    except OSError as error:
        print(f'Warning: could not keep the secret key in {path} ({error}); '
              'restarting the server will log everyone out')
        return os.urandom(LENGTH)
    if len(key) != LENGTH:
        raise ValueError(f'{path} is not a valid key. Delete it to have a new one '
                         'made, which logs everyone out.')
    return key


def _create(path):
    # Written in full under another name first, so that a second process
    # starting at the same time never reads half a key
    temporary = path.with_name(f'secret_key.{os.getpid()}')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_BINARY', 0), 0o600)
    with os.fdopen(descriptor, 'wb') as file:
        file.write(os.urandom(LENGTH))
    os.replace(temporary, path)
