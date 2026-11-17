//! A brand kit's fonts and logos, each kept as a file of its own in the app's data
//! folder, so `brand-kits.json` stays small and is cheap to write on every change.
//!
//! A file is named by what's in it (its SHA-256, then its type), so the same font
//! is kept once however many kits use it, and the webview only ever sends a name
//! this side made: it never names a path. Files no kit refers to any more are
//! cleared whenever the kits are written.

use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};
use tauri::{
    AppHandle, Manager,
    ipc::{InvokeBody, Request, Response},
};

const FOLDER: &str = "brand-assets";
const TYPE_HEADER: &str = "x-layer-asset-type";
/// Above any font or logo a kit accepts (fonts are capped at 12 MB on the way in).
const MAX_ASSET_BYTES: usize = 24 * 1024 * 1024;

/// The types a kit keeps, and the extension each is filed under.
const TYPES: [(&str, &str); 10] = [
    ("font/woff2", "woff2"),
    ("font/woff", "woff"),
    ("font/ttf", "ttf"),
    ("font/otf", "otf"),
    ("application/font-woff", "woff"),
    ("image/png", "png"),
    ("image/jpeg", "jpg"),
    ("image/webp", "webp"),
    ("image/gif", "gif"),
    ("image/svg+xml", "svg"),
];

#[derive(Debug, thiserror::Error)]
enum AssetError {
    #[error("Layer couldn't find its data folder.")]
    NoFolder,
    #[error("Layer can't keep that kind of file in a brand kit.")]
    UnknownType,
    #[error("That file is too large to keep in a brand kit.")]
    TooBig,
    #[error("Something went wrong preparing that file.")]
    Malformed,
    #[error("Layer couldn't find that file in your brand kits.")]
    Missing,
    // The OS error isn't passed on: it names the file's path.
    #[error("Layer couldn't keep that file.")]
    Io,
}

fn extension_of(mime: &str) -> Option<&'static str> {
    TYPES
        .iter()
        .find(|(known, _)| known.eq_ignore_ascii_case(mime))
        .map(|(_, extension)| *extension)
}

/// A name this side made: 64 hex digits, a dot, and a known extension. Nothing
/// else is ever joined to the folder, so no name can reach outside it.
fn is_asset_name(name: &str) -> bool {
    let Some((hash, extension)) = name.split_once('.') else {
        return false;
    };
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        && TYPES.iter().any(|(_, known)| *known == extension)
}

fn name_of(bytes: &[u8], extension: &str) -> String {
    let hash = Sha256::digest(bytes);
    let hex: String = hash.iter().map(|byte| format!("{byte:02x}")).collect();
    format!("{hex}.{extension}")
}

fn folder_of(app: &AppHandle) -> Result<PathBuf, AssetError> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(FOLDER))
        .map_err(|_| AssetError::NoFolder)
}

/// Keeps the file, if it isn't kept already, and gives back its name.
fn keep(folder: &Path, bytes: &[u8], mime: &str) -> Result<String, AssetError> {
    let extension = extension_of(mime).ok_or(AssetError::UnknownType)?;
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AssetError::TooBig);
    }
    let name = name_of(bytes, extension);
    let path = folder.join(&name);
    if path.exists() {
        return Ok(name);
    }
    let io_error = |_: io::Error| AssetError::Io;
    fs::create_dir_all(folder).map_err(io_error)?;
    // All or nothing, so a crash mid-write can't leave half a font under a good name.
    let mut file = tempfile::NamedTempFile::new_in(folder).map_err(io_error)?;
    file.write_all(bytes).map_err(io_error)?;
    file.persist(&path).map_err(|error| io_error(error.error))?;
    Ok(name)
}

fn read(folder: &Path, name: &str) -> Result<Vec<u8>, AssetError> {
    if !is_asset_name(name) {
        return Err(AssetError::Malformed);
    }
    let path = folder.join(name);
    let fits = fs::metadata(&path).is_ok_and(|meta| meta.len() <= MAX_ASSET_BYTES as u64);
    if !fits {
        return Err(AssetError::Missing);
    }
    fs::read(path).map_err(|_| AssetError::Missing)
}

/// Every asset name the kits file refers to, wherever it is in it.
fn referenced(kits: &serde_json::Value, names: &mut HashSet<String>) {
    match kits {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                match value {
                    serde_json::Value::String(name) if key == "asset" && is_asset_name(name) => {
                        names.insert(name.clone());
                    }
                    other => referenced(other, names),
                }
            }
        }
        serde_json::Value::Array(list) => list.iter().for_each(|value| referenced(value, names)),
        _ => {}
    }
}

/// Removes the kept files no kit refers to any more. Only files this side named
/// are touched; anything else in the folder is left alone.
fn prune(folder: &Path, kits_text: &str) {
    let Ok(kits) = serde_json::from_str::<serde_json::Value>(kits_text) else {
        return;
    };
    let mut keep_names = HashSet::new();
    referenced(&kits, &mut keep_names);
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if is_asset_name(name) && !keep_names.contains(name) {
            // Best effort: a file that can't go now goes next time.
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// After the kits are written: clears what they no longer use.
pub fn prune_unused(app: &AppHandle, kits_text: &str) {
    if let Ok(folder) = folder_of(app) {
        prune(&folder, kits_text);
    }
}

/// Keeps a font or logo, sent as a raw body with its type in a header, and gives
/// back the name to refer to it by.
#[tauri::command]
pub async fn store_brand_asset(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let mime = request
        .headers()
        .get(TYPE_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| AssetError::Malformed.to_string())?;
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => return Err(AssetError::Malformed.to_string()),
    };
    let folder = folder_of(&app).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || keep(&folder, &bytes, &mime))
        .await
        .map_err(|_| AssetError::Io.to_string())?
        .map_err(|error| error.to_string())
}

/// A kept font or logo, as raw bytes: JSON would be slow over IPC.
#[tauri::command]
pub async fn load_brand_asset(app: AppHandle, name: String) -> Result<Response, String> {
    let folder = folder_of(&app).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || read(&folder, &name))
        .await
        .map_err(|_| AssetError::Io.to_string())?
        .map(Response::new)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_made_here_and_only_those_are_read() {
        let name = name_of(b"font bytes", "woff2");
        assert!(is_asset_name(&name));
        for bad in [
            "../brand-kits.json",
            "a.woff2",
            &format!("{}.exe", "a".repeat(64)),
            &format!("{}.woff2", "A".repeat(64)),
            &format!("../{}.woff2", "a".repeat(61)),
            &format!("{}/x.woff2", "a".repeat(62)),
            "",
        ] {
            assert!(!is_asset_name(bad), "{bad}");
        }
    }

    #[test]
    fn keeps_a_file_once_by_what_is_in_it_and_reads_it_back() {
        let directory = tempfile::tempdir().expect("temp dir");
        let folder = directory.path().join(FOLDER);
        let first = keep(&folder, b"logo", "image/png").expect("kept");
        let again = keep(&folder, b"logo", "image/png").expect("kept");
        assert_eq!(first, again);
        assert!(first.ends_with(".png"));
        assert_eq!(read(&folder, &first).expect("read"), b"logo");
        assert_eq!(fs::read_dir(&folder).expect("folder").count(), 1);
    }

    #[test]
    fn refuses_unknown_types_and_files_too_big() {
        let directory = tempfile::tempdir().expect("temp dir");
        let folder = directory.path().join(FOLDER);
        assert!(matches!(
            keep(&folder, b"x", "application/x-msdownload"),
            Err(AssetError::UnknownType)
        ));
        let huge = vec![0u8; MAX_ASSET_BYTES + 1];
        assert!(matches!(
            keep(&folder, &huge, "font/ttf"),
            Err(AssetError::TooBig)
        ));
        assert!(matches!(
            read(&folder, "../brand-kits.json"),
            Err(AssetError::Malformed)
        ));
    }

    #[test]
    fn clears_what_no_kit_refers_to_and_nothing_else() {
        let directory = tempfile::tempdir().expect("temp dir");
        let folder = directory.path().join(FOLDER);
        let used = keep(&folder, b"used", "font/ttf").expect("kept");
        let unused = keep(&folder, b"unused", "image/png").expect("kept");
        fs::write(folder.join("notes.txt"), "mine").expect("write");

        let kits = format!(
            r#"{{"version":2,"kits":[{{"fonts":[{{"files":[{{"weight":400,"asset":"{used}"}}]}}]}}]}}"#
        );
        prune(&folder, &kits);

        assert!(folder.join(&used).exists());
        assert!(!folder.join(&unused).exists());
        assert!(folder.join("notes.txt").exists());
    }
}
