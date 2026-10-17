"""Preserve a Git worktree, including untracked source assets, without changing its index."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
from datetime import datetime, timezone


def git(root, *args):
    return subprocess.run(
        ["git", "--no-optional-locks", "-C", str(root), *args],
        check=True, capture_output=True,
    ).stdout


def digest_file(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(directory):
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    with zipfile.ZipFile(directory / "worktree.zip") as archive:
        expected = {entry["path"] for entry in manifest["files"]}
        if set(archive.namelist()) != expected:
            raise RuntimeError("Archive contents differ from the manifest")
        for entry in manifest["files"]:
            with archive.open(entry["path"]) as stream:
                checksum = hashlib.file_digest(stream, "sha256").hexdigest()
            if checksum != entry["sha256"]:
                raise RuntimeError(f"Archive checksum mismatch: {entry['path']}")
    for name, checksum in manifest["supportingFiles"].items():
        if digest_file(directory / name) != checksum:
            raise RuntimeError(f"Supporting file checksum mismatch: {name}")
    print(json.dumps({"verified": str(directory), "files": len(expected),
                      "bytes": sum(entry["bytes"] for entry in manifest["files"]),
                      "baseCommit": manifest["baseCommit"]}))


def create(root, destination):
    root = Path(git(root, "rev-parse", "--show-toplevel").decode().strip()).resolve()
    destination = destination.resolve()
    if destination.is_relative_to(root):
        raise RuntimeError("Keep checkpoints outside the source repository")
    destination.mkdir(parents=True, exist_ok=False)
    status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all")
    names = sorted(set(git(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")) - {""})
    files, missing = [], []
    with zipfile.ZipFile(destination / "worktree.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
        for name in names:
            candidate = root / name
            if candidate.is_symlink():
                raise RuntimeError(f"Unsupported symbolic link: {name}")
            source = candidate.resolve()
            if not source.is_relative_to(root):
                raise RuntimeError(f"Source escapes repository: {name}")
            if not source.exists():
                missing.append(name)
                continue
            if source.is_symlink() or not source.is_file():
                raise RuntimeError(f"Unsupported source type: {name}")
            before = source.stat()
            checksum = digest_file(source)
            archive.write(source, name)
            after = source.stat()
            if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                raise RuntimeError(f"Source changed during checkpoint: {name}")
            files.append({"path": name, "bytes": before.st_size, "sha256": checksum})
    (destination / "status.nul").write_bytes(status)
    (destination / "working-tree.patch").write_bytes(git(root, "diff", "--binary", "HEAD"))
    (destination / "index.patch").write_bytes(git(root, "diff", "--cached", "--binary", "HEAD"))
    git(root, "bundle", "create", str(destination / "history.bundle"), "--all", "HEAD")
    git(root, "bundle", "verify", str(destination / "history.bundle"))
    if git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all") != status:
        raise RuntimeError("Working-tree status changed during checkpoint")
    manifest = {
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "source": str(root), "baseCommit": git(root, "rev-parse", "HEAD").decode().strip(),
        "files": files, "absentTrackedPaths": missing,
        "supportingFiles": {name: digest_file(destination / name) for name in
                            ["history.bundle", "status.nul", "working-tree.patch", "index.patch"]},
        "excludes": "Ignored dependencies, generated outputs, local caches, and ignored workstation state",
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (destination / "RESTORE.txt").write_text(
        "Restore into a NEW directory, never over the active checkout.\n"
        "1. Verify: python <repository>/tools/cleanup/checkpoint.py verify <checkpoint>\n"
        "2. git clone <checkpoint>/history.bundle <new-directory>\n"
        f"3. git -C <new-directory> checkout --detach {manifest['baseCommit']}\n"
        "4. Extract worktree.zip over the new checkout, preserving relative paths.\n"
        "5. Remove paths listed in manifest.json absentTrackedPaths from that new checkout only.\n"
        "6. To restore the original index, apply index.patch with git apply --cached when nonempty.\n"
        "The ZIP already contains all working-tree edits and untracked sources. Do not also apply working-tree.patch.\n"
        "Ignored dependencies and generated assets must be installed/regenerated.\n",
        encoding="utf-8",
    )
    verify(destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    creation = subparsers.add_parser("create")
    creation.add_argument("destination", type=Path)
    creation.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    verification = subparsers.add_parser("verify")
    verification.add_argument("directory", type=Path)
    arguments = parser.parse_args()
    if arguments.command == "create":
        create(arguments.root, arguments.destination)
    else:
        verify(arguments.directory)
