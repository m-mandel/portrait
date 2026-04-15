import json
import shutil
from pathlib import Path


WEB_ROOT = Path(__file__).resolve().parent
BUNDLE_DATA_ROOT = WEB_ROOT / "data"
SOURCE_DATASETS = {
    "piven": Path("/workspace/input/piven/data"),
    "noma_bar": Path("/workspace/input/noma_bar/data"),
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def numeric_sort_key(path: Path):
    stem = path.stem
    return (0, int(stem)) if stem.isdigit() else (1, stem)


def copy_asset(source: Path, relative_target: Path) -> str | None:
    if not source.exists():
        return None

    target = WEB_ROOT / relative_target
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    return relative_target.as_posix()


def collect_subject(dataset_name: str, person_dir: Path) -> dict | None:
    meta_path = person_dir / "meta.json"
    face_json_path = person_dir / "lvface_pairwise_similarities.json"
    text_json_path = person_dir / "meta_text_similarities.json"
    portrait_matrix_path = person_dir / "lvface_similarity_matrix_with_portrait.png"
    image_matrix_path = person_dir / "lvface_similarity_matrix.png"
    bio_text_matrix_path = person_dir / "bio_vs_portrait_text_similarity_matrix.png"
    bio_elements_matrix_path = person_dir / "bio_elements_vs_portrait_text_similarity_matrix.png"
    portrait_path = person_dir / "portrait.jpg"
    cropped_dir = person_dir / "cropped_images"

    required = [meta_path, face_json_path, text_json_path, portrait_path, cropped_dir]
    if not all(path.exists() for path in required):
        return None

    meta = load_json(meta_path)
    face_data = load_json(face_json_path)
    text_data = load_json(text_json_path)
    subject_bundle_dir = Path("data") / dataset_name / person_dir.name

    cropped_images = sorted(
        (
            path for path in cropped_dir.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
        ),
        key=numeric_sort_key,
    )

    portrait_bundle_path = copy_asset(portrait_path, subject_bundle_dir / portrait_path.name)
    copy_asset(meta_path, subject_bundle_dir / meta_path.name)
    face_json_bundle_path = copy_asset(face_json_path, subject_bundle_dir / face_json_path.name)
    text_json_bundle_path = copy_asset(text_json_path, subject_bundle_dir / text_json_path.name)
    portrait_matrix_bundle_path = copy_asset(
        portrait_matrix_path,
        subject_bundle_dir / portrait_matrix_path.name,
    )
    image_matrix_bundle_path = copy_asset(
        image_matrix_path,
        subject_bundle_dir / image_matrix_path.name,
    )
    bio_text_matrix_bundle_path = copy_asset(
        bio_text_matrix_path,
        subject_bundle_dir / bio_text_matrix_path.name,
    )
    bio_elements_matrix_bundle_path = copy_asset(
        bio_elements_matrix_path,
        subject_bundle_dir / bio_elements_matrix_path.name,
    )

    return {
        "slug": person_dir.name,
        "name": meta.get("name", person_dir.name).replace("_", " "),
        "bio": meta.get("bio", ""),
        "portraitPath": portrait_bundle_path,
        "croppedImages": [
            {
                "index": idx,
                "path": copy_asset(path, subject_bundle_dir / "cropped_images" / path.name),
            }
            for idx, path in enumerate(cropped_images)
        ],
        "portraitElements": [item.get("element", "") for item in meta.get("portrait_elements", [])],
        "bioElements": [item.get("element", "") for item in meta.get("bio_elements", [])],
        "metaSources": meta.get("bio_sources", []),
        "imageSimilarity": {
            "jsonPath": face_json_bundle_path,
            "matrixLabels": face_data.get("portrait", {}).get("matrix", {}).get("labels"),
            "matrixValues": face_data.get("portrait", {}).get("matrix", {}).get("values"),
            "plotPath": portrait_matrix_bundle_path,
            "basePlotPath": image_matrix_bundle_path,
        },
        "textSimilarity": {
            "jsonPath": text_json_bundle_path,
            "bioVsPortrait": text_data.get("bio_vs_portrait"),
            "bioElementsVsPortrait": text_data.get("bio_elements_vs_portrait"),
            "bioVsPortraitPlotPath": bio_text_matrix_bundle_path,
            "bioElementsPlotPath": bio_elements_matrix_bundle_path,
        },
    }


def build_manifest() -> dict:
    manifest = {"datasets": {}}
    if BUNDLE_DATA_ROOT.exists():
        shutil.rmtree(BUNDLE_DATA_ROOT)

    for dataset_name, dataset_root in SOURCE_DATASETS.items():
        subjects = []
        for person_dir in sorted(dataset_root.iterdir()):
            if not person_dir.is_dir():
                continue
            subject = collect_subject(dataset_name, person_dir)
            if subject:
                subjects.append(subject)

        manifest["datasets"][dataset_name] = {
            "label": dataset_name.replace("_", " "),
            "root": (Path("data") / dataset_name).as_posix(),
            "subjects": subjects,
        }

    return manifest


if __name__ == "__main__":
    manifest = build_manifest()
    output_path = WEB_ROOT / "app-data.json"
    output_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    js_path = WEB_ROOT / "static/js/app-data.js"
    js_path.write_text(
        "window.APP_DATA = " + json.dumps(manifest, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(output_path)
