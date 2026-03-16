#!/usr/bin/env bash
# Runs brpt from source (forwarding all arguments).
exec python3 "$(dirname "$0")/../resources/brpt" "$@"
