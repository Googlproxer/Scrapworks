"""Read the installed MPFB configuration and asset libraries in live Blender."""
import bpy
import importlib
import json
from pathlib import Path

pkg = next((name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb') or name == 'mpfb'), None)
if not pkg:
    raise RuntimeError('MPFB is installed but not enabled')
LocationService = importlib.import_module(pkg + '.services.locationservice').LocationService
AssetService = importlib.import_module(pkg + '.services.assetservice').AssetService
paths = {name: getattr(LocationService, name)() for name in ('get_user_data', 'get_user_config', 'get_mpfb_data', 'get_mpfb_root', 'get_mh_user_data')}
assets = {}
for kind in ('eyes', 'hair', 'eyebrows', 'eyelashes', 'teeth', 'tongue', 'clothes', 'skins'):
    AssetService.update_asset_list(kind, asset_type='mhmat' if kind == 'skins' else 'mhclo')
    assets[kind] = AssetService.get_asset_list(kind)
result = {'package': pkg, 'paths': paths, 'assets': assets, 'scenes': [s.name for s in bpy.data.scenes]}
report = Path(__file__).resolve().parents[2] / 'docs/art/characters/3d/mpfb-inspection.json'
report.write_text(json.dumps(result, indent=2, default=str), encoding='utf-8')
