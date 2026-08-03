#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: sudo ./install-rendezvous-server.sh /path/to/audio-relay-server" >&2
  exit 2
fi

source_binary="$1"
if [[ ! -f "$source_binary" ]]; then
  echo "Binary not found: $source_binary" >&2
  exit 2
fi

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
service_file="$script_directory/../deploy/audio-relay-server.service"
if [[ ! -f "$service_file" ]]; then
  echo "Service file not found: $service_file" >&2
  exit 2
fi

install -o root -g root -m 0755 "$source_binary" /usr/local/bin/audio-relay-server
install -o root -g root -m 0644 "$service_file" /etc/systemd/system/audio-relay-server.service
systemctl daemon-reload
systemctl enable audio-relay-server.service
systemctl restart audio-relay-server.service
systemctl --no-pager --full status audio-relay-server.service
