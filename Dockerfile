FROM python:3.9-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update --fix-missing && \
    apt-get update && \
    apt-get install -y gdal-bin libgdal-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Install uv. The installer puts the binary in ~/.local/bin.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Copy project files. The built frontend bundle (iris/static/dist) is
# committed, so no Node toolchain is needed in the image.
COPY . /app/
WORKDIR /app

# Install IRIS using uv with the lock file for reproducible builds
RUN uv sync --frozen --no-dev

# Host and port come from the project config (defaults 127.0.0.1:5000).
# Set "host": "0.0.0.0" in the mounted config so the port is reachable from
# outside the container; see the Docker section of the README.
ENTRYPOINT ["/app/.venv/bin/iris"]
