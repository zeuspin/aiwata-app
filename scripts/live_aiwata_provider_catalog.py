"""Expose only native provider credential schema, never credential values."""
import json
from hermes_cli.auth import PROVIDER_REGISTRY

print(json.dumps({'result': {slug: {'name': row.name, 'auth_type': row.auth_type,
    'key_env': (row.api_key_env_vars or [''])[0]} for slug, row in PROVIDER_REGISTRY.items()}}))
