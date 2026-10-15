"""Convert public PNG art to transparent WebP without changing image dimensions.

Run with Python and Pillow installed: python scripts/optimize-static-images.py
Existing WebP files are untouched. A PNG is removed only when its replacement is
smaller and its decoded dimensions and alpha channel match the original.
"""

from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from PIL import Image, ImageFile


PUBLIC = Path(__file__).resolve().parent.parent / "public"


def convert(source: Path) -> tuple[int, int, str]:
    destination = source.with_suffix(".webp")
    if destination.exists():
        raise FileExistsError(f"Destination already exists: {destination}")
    # This one original explosion PNG is truncated. Preserve its readable
    # pixels while rejecting truncated files introduced in later batches.
    ImageFile.LOAD_TRUNCATED_IMAGES = (
        source.relative_to(PUBLIC).as_posix() == "vfx/deadly-mark-explosion/frame-06.png"
    )
    with Image.open(source) as image:
        # Lossless keeps the small interface icons sharp. Large painted assets
        # use high-quality lossy RGB with the original alpha channel retained.
        options = ({"lossless": True} if source.stat().st_size < 40_000 else
                   {"quality": 90, "alpha_quality": 100})
        image.save(destination, format="WEBP", method=4, **options)
        with Image.open(destination) as optimized:
            # Opaque RGBA PNGs may correctly decode as RGB WebP.
            original_alpha = image.convert("RGBA").getchannel("A").tobytes()
            optimized_alpha = optimized.convert("RGBA").getchannel("A").tobytes()
            if image.size != optimized.size or original_alpha != optimized_alpha:
                destination.unlink()
                raise ValueError(f"Image dimensions or transparency changed: {source}")
    original_bytes = source.stat().st_size
    optimized_bytes = destination.stat().st_size
    if optimized_bytes >= original_bytes:
        destination.unlink()
        raise ValueError(f"WebP is not smaller: {source}")
    source.unlink()
    return original_bytes, optimized_bytes, str(source.relative_to(PUBLIC))


if __name__ == "__main__":
    sources = sorted(PUBLIC.rglob("*.png"))
    with ProcessPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(convert, sources))
    print(f"Converted {len(results)} PNG files: "
          f"{sum(item[0] for item in results):,} → {sum(item[1] for item in results):,} bytes")
