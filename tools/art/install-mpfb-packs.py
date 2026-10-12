"""Install official CC0 asset ZIPs using MPFB's Load Pack operator."""
import bpy
import importlib
import json
from pathlib import Path

pkg = next(name for name in bpy.context.preferences.addons.keys() if name.endswith('.mpfb'))
AssetService = importlib.import_module(pkg + '.services.assetservice').AssetService
pack_dir = Path('L:/Angular/tools/mpfb-assets')
installed = []
for pack in ('makehuman_system_assets', 'pants01', 'shirts01', 'shoes01'):
    path = pack_dir / (pack + '_cc0.zip')
    if not path.is_file():
        raise FileNotFoundError(path)
    issue = AssetService.check_asset_pack_zip(str(path))
    if issue:
        raise RuntimeError(f'{pack}: {issue}')
    status = bpy.ops.mpfb.load_pack(filepath=str(path))
    if 'FINISHED' not in status:
        raise RuntimeError(f'MPFB pack install failed: {pack}')
    installed.append(pack)
AssetService.rescan_pack_metadata()
result = {'installed_through_mpfb': installed, 'packs': AssetService.get_pack_names()}
