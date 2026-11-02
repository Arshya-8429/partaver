"""Deterministic ZIP creation and bounded extraction; arguments never enter a shell."""
import datetime
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import zipfile


def create(source, output, epoch):
    source = Path(source).resolve()
    timestamp = datetime.datetime.fromtimestamp(max(315532800, min(epoch, 4354819198)), datetime.timezone.utc)
    with zipfile.ZipFile(output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for directory, dirs, files in os.walk(source, followlinks=False):
            dirs.sort()
            for name in sorted(files):
                path = Path(directory) / name
                if path.is_symlink() or not path.is_file():
                    raise ValueError("Release contains a non-regular file")
                info = zipfile.ZipInfo(path.relative_to(source).as_posix(), timestamp.timetuple()[:6])
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                with path.open("rb") as src, archive.open(info, "w", force_zip64=True) as dst:
                    shutil.copyfileobj(src, dst, 1024 * 1024)
    Path(output).chmod(0o600)


def extract(source, output):
    output = Path(output)
    if output.exists():
        raise ValueError("Extraction output already exists")
    with zipfile.ZipFile(source, "r") as archive:
        entries = archive.infolist()
        if len(entries) > 100000 or sum(item.file_size for item in entries) > 20 * 1024 ** 3:
            raise ValueError("Release archive exceeds extraction limits")
        names = set()
        for item in entries:
            name = item.filename
            path = PurePosixPath(name)
            if (not name or "\\" in name or name.startswith("/") or ":" in path.parts[0]
                    or any(part in ("", ".", "..") for part in name.rstrip("/").split("/"))
                    or stat.S_ISLNK(item.external_attr >> 16) or name in names):
                raise ValueError("Unsafe or duplicate ZIP entry: " + name)
            names.add(name)
        output.mkdir(parents=True, mode=0o700)
        for item in entries:
            target = output.joinpath(*PurePosixPath(item.filename).parts)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as src, target.open("xb") as dst:
                shutil.copyfileobj(src, dst, 1024 * 1024)
            target.chmod(0o644)


if __name__ == "__main__":
    if len(sys.argv) == 5 and sys.argv[1] == "create":
        create(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    elif len(sys.argv) == 4 and sys.argv[1] == "extract":
        extract(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit("Usage: archive.py create ROOT NEW.zip EPOCH | extract ZIP NEW_DIRECTORY")
