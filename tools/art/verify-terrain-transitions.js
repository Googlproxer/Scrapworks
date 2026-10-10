// Run with: tiled --evaluate verify-terrain-transitions.js <tileset.tsx> <report.json> [preview.tmx]
// Uses Tiled's terrain matcher, including its horizontal/vertical flip handling.
const tilesetPath = tiled.scriptArguments[0];
const reportPath = tiled.scriptArguments[1];
const previewPath = tiled.scriptArguments[2];
if (!tilesetPath || !reportPath) throw new Error("Expected tileset and report paths.");
const tileset = tiled.tilesetFormatForFile(tilesetPath).read(tilesetPath);
const world = tileset.wangSets.find(set => set.name === "World Terrain");
const pairs = tileset.wangSets.filter(set => set.name !== "World Terrain");
if (!world || pairs.length !== 6 || tileset.tileCount !== 48) throw new Error("Unexpected terrain tileset.");
function layerFor(map, name, width, height) {
    const layer = new TileLayer(name);
    layer.width = width;
    layer.height = height;
    map.addLayer(layer);
    return layer;
}
function mapFor(width, height) {
    const map = new TileMap();
    map.width = width;
    map.height = height;
    map.tileWidth = 64;
    map.tileHeight = 52;
    map.addTileset(tileset);
    return map;
}
function cornersAt(layer, set, x, y) {
    const cell = layer.cellAt(x, y);
    if (cell.empty) throw new Error("Terrain matcher left an empty cell.");
    if (cell.flippedAntiDiagonally) throw new Error("Rectangular tile was rotated.");
    const id = set.wangId(layer.tileAt(x, y));
    let corners = [id[7], id[1], id[3], id[5]];
    if (cell.flippedHorizontally) corners = [corners[1], corners[0], corners[3], corners[2]];
    if (cell.flippedVertically) corners = [corners[3], corners[2], corners[1], corners[0]];
    return corners;
}
function colourIndex(set, name) {
    for (let i = 1; i <= set.colorCount; i++) if (set.colorName(i) === name) return i;
    throw new Error("Missing terrain colour " + name);
}
const results = [];
pairs.forEach(pair => {
    const names = [pair.colorName(1), pair.colorName(2)];
    [pair, world].forEach(set => {
        const colours = names.map(name => colourIndex(set, name));
        for (let mask = 0; mask < 16; mask++) {
            const map = mapFor(1, 1);
            const layer = layerFor(map, "Terrain", 1, 1);
            const desired = [0, 1, 2, 3].map(bit => colours[(mask & (1 << bit)) ? 1 : 0]);
            const edit = layer.wangEdit(set);
            edit.erasingEnabled = false;
            [7, 1, 3, 5].forEach((index, bit) => edit.setWangIndex(0, 0, index, desired[bit]));
            edit.apply();
            const actual = cornersAt(layer, set, 0, 0);
            if (JSON.stringify(actual) !== JSON.stringify(desired)) {
                throw new Error(set.name + " failed " + pair.name + " mask " + mask + ": " + JSON.stringify(actual));
            }
            results.push({set: set.name, pair: pair.name, mask: mask, tileId: layer.cellAt(0, 0).tileId, flags: layer.flagsAt(0, 0)});
        }
    });
});
if (previewPath) {
    const preview = mapFor(26, 17);
    pairs.forEach((set, i) => {
        const layer = layerFor(preview, set.name, 26, 17);
        const ox = i % 3 * 9;
        const oy = Math.floor(i / 3) * 9;
        const base = tileset.findTile({Dirt: 0, Stone: 4, Water: 8, Grass: 12}[set.colorName(1)]);
        const fill = layer.edit();
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) fill.setTile(ox + x, oy + y, base);
        fill.apply();
        const brush = layer.wangEdit(set);
        brush.erasingEnabled = false;
        brush.correctionsEnabled = true;
        for (let y = 2; y <= 6; y++) for (let x = 2; x <= 6; x++) brush.setCorner(ox + x, oy + y, 2);
        brush.setCorner(ox + 2, oy + 5, 1);
        brush.setCorner(ox + 3, oy + 5, 1);
        brush.setCorner(ox + 3, oy + 4, 1);
        brush.setCorner(ox + 6, oy + 2, 1);
        brush.setCorner(ox + 5, oy + 3, 1);
        brush.apply();
    });
    const error = tiled.mapFormat("tmx").write(preview, previewPath);
    if (error) throw new Error(error);
    // Keep generated examples linked to the shared external tileset.
    const sourceParts = tilesetPath.replace(/\\/g, "/").split("/");
    const parentParts = previewPath.replace(/\\/g, "/").split("/").slice(0, -1);
    let common = 0;
    while (common < sourceParts.length && common < parentParts.length && sourceParts[common] === parentParts[common]) common++;
    const sourceReference = parentParts.slice(common).map(() => "..").concat(sourceParts.slice(common)).join("/");
    const reader = new TextFile(previewPath, TextFile.ReadOnly);
    const previewXml = reader.readAll();
    reader.close();
    const writer = new TextFile(previewPath, TextFile.WriteOnly);
    writer.write(previewXml.replace(/<tileset\b[\s\S]*?<\/tileset>/, '<tileset firstgid="1" source="' + sourceReference + '"/>'));
    writer.commit();
}
const file = new TextFile(reportPath, TextFile.WriteOnly);
file.write(JSON.stringify({tiledVersion: tiled.version,passed: true,checkedPatterns: results.length,terrainSets: tileset.wangSets.map(set => set.name),results: results}, null, 2));
file.commit();
