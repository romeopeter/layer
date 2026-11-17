//! Things the user keeps to use again in any project (saved backgrounds, brand
//! kits, pattern colours) and how they like Layer set up (preferences), each in a
//! small JSON file in the app's data folder. SQLite comes only with a feature that
//! needs it (implementation.md §13). The webview
//! sends and receives them as JSON text; this side only checks their shape and
//! keeps them whole.

use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

use tauri::{AppHandle, Manager};

/// Far above anything sensible, even with images and fonts in it. Only stops a
/// runaway file being read whole or written.
const MAX_FILE_BYTES: usize = 64 * 1024 * 1024;

/// One file of kept things: where it lives, what it's called to the user, and
/// what it must look like.
struct Kept {
    file_name: &'static str,
    /// As the user would say it, for messages: "saved backgrounds".
    what: &'static str,
    /// What reads back when there's no file yet, or it's damaged.
    empty: &'static str,
    is_whole: fn(&str) -> bool,
}

const SAVED_BACKGROUNDS: Kept = Kept {
    file_name: "saved-backgrounds.json",
    what: "saved backgrounds",
    empty: "[]",
    is_whole: is_list,
};

const BRAND_KITS: Kept = Kept {
    file_name: "brand-kits.json",
    what: "brand kits",
    empty: r#"{"version":1,"activeId":null,"kits":[]}"#,
    is_whole: is_kits_file,
};

const PATTERN_COLORS: Kept = Kept {
    file_name: "pattern-colors.json",
    what: "pattern colors",
    empty: "[]",
    is_whole: is_list,
};

const PREFERENCES: Kept = Kept {
    file_name: "preferences.json",
    what: "preferences",
    empty: "{}",
    is_whole: is_object,
};

#[derive(Debug, thiserror::Error)]
enum SaveError {
    #[error("Layer couldn't find its data folder.")]
    NoFolder,
    #[error("There's too much in your {0} to keep. Delete some, then try again.")]
    TooBig(&'static str),
    #[error("Layer couldn't keep those {0}.")]
    NotWhole(&'static str),
    // The OS error isn't passed on: it names the file's path.
    #[error("Layer couldn't save your {0}.")]
    Io(&'static str),
}

fn is_list(text: &str) -> bool {
    serde_json::from_str::<Vec<serde_json::Value>>(text).is_ok()
}

fn is_object(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text).is_ok_and(|value| value.is_object())
}

/// An object with a list of kits in it.
fn is_kits_file(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(text)
        .is_ok_and(|value| value.get("kits").is_some_and(serde_json::Value::is_array))
}

fn file_of(app: &AppHandle, kept: &Kept) -> Result<PathBuf, SaveError> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(kept.file_name))
        .map_err(|_| SaveError::NoFolder)
}

/// What's kept, or the empty kind when there's no file yet or it's damaged.
fn read_kept(path: &Path, kept: &Kept) -> String {
    let fits = fs::metadata(path).is_ok_and(|meta| meta.len() <= MAX_FILE_BYTES as u64);
    match fs::read_to_string(path) {
        Ok(text) if fits && (kept.is_whole)(&text) => text,
        _ => kept.empty.to_owned(),
    }
}

/// All or nothing, so a crash mid-write can't leave half a file behind.
fn write_kept(path: &Path, kept: &Kept, text: &str) -> Result<(), SaveError> {
    if text.len() > MAX_FILE_BYTES {
        return Err(SaveError::TooBig(kept.what));
    }
    if !(kept.is_whole)(text) {
        return Err(SaveError::NotWhole(kept.what));
    }
    let directory = path.parent().ok_or(SaveError::NoFolder)?;
    let io_error = |_: io::Error| SaveError::Io(kept.what);
    fs::create_dir_all(directory).map_err(io_error)?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(io_error)?;
    file.write_all(text.as_bytes()).map_err(io_error)?;
    file.persist(path).map_err(|error| io_error(error.error))?;
    Ok(())
}

async fn load(app: AppHandle, kept: &'static Kept) -> Result<String, String> {
    let path = file_of(&app, kept).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || read_kept(&path, kept))
        .await
        .map_err(|_| SaveError::NotWhole(kept.what).to_string())
}

async fn store(app: AppHandle, kept: &'static Kept, text: String) -> Result<(), String> {
    let path = file_of(&app, kept).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || write_kept(&path, kept, &text))
        .await
        .map_err(|_| SaveError::NotWhole(kept.what).to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn load_saved_backgrounds(app: AppHandle) -> Result<String, String> {
    load(app, &SAVED_BACKGROUNDS).await
}

#[tauri::command]
pub async fn store_saved_backgrounds(app: AppHandle, list: String) -> Result<(), String> {
    store(app, &SAVED_BACKGROUNDS, list).await
}

#[tauri::command]
pub async fn load_brand_kits(app: AppHandle) -> Result<String, String> {
    load(app, &BRAND_KITS).await
}

/// Writes the kits, then clears the fonts and logos they no longer use.
#[tauri::command]
pub async fn store_brand_kits(app: AppHandle, kits: String) -> Result<(), String> {
    store(app.clone(), &BRAND_KITS, kits.clone()).await?;
    tauri::async_runtime::spawn_blocking(move || crate::brand_assets::prune_unused(&app, &kits))
        .await
        .map_err(|_| SaveError::NotWhole(BRAND_KITS.what).to_string())
}

#[tauri::command]
pub async fn load_pattern_colors(app: AppHandle) -> Result<String, String> {
    load(app, &PATTERN_COLORS).await
}

#[tauri::command]
pub async fn store_pattern_colors(app: AppHandle, list: String) -> Result<(), String> {
    store(app, &PATTERN_COLORS, list).await
}

#[tauri::command]
pub async fn load_preferences(app: AppHandle) -> Result<String, String> {
    load(app, &PREFERENCES).await
}

#[tauri::command]
pub async fn store_preferences(app: AppHandle, preferences: String) -> Result<(), String> {
    store(app, &PREFERENCES, preferences).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file_in(directory: &tempfile::TempDir, kept: &Kept) -> PathBuf {
        directory.path().join("nested").join(kept.file_name)
    }

    #[test]
    fn keeps_a_list_and_reads_it_back() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = file_in(&directory, &SAVED_BACKGROUNDS);
        let list = r##"[{"id":"bg_1","background":{"mode":"solid","color":"#123456"}}]"##;

        write_kept(&path, &SAVED_BACKGROUNDS, list).expect("saved");

        assert_eq!(read_kept(&path, &SAVED_BACKGROUNDS), list);
    }

    #[test]
    fn keeps_brand_kits_and_reads_them_back() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = file_in(&directory, &BRAND_KITS);
        let file = r#"{"version":1,"activeId":"bk_1","kits":[{"id":"bk_1","name":"Acme"}]}"#;

        write_kept(&path, &BRAND_KITS, file).expect("saved");

        assert_eq!(read_kept(&path, &BRAND_KITS), file);
    }

    #[test]
    fn keeps_pattern_colors_and_reads_them_back() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = file_in(&directory, &PATTERN_COLORS);
        let list = r##"[{"id":"pair_1","base":"#112233","accent":"#AABBCC","source":"custom"}]"##;

        write_kept(&path, &PATTERN_COLORS, list).expect("saved");

        assert_eq!(read_kept(&path, &PATTERN_COLORS), list);
    }

    #[test]
    fn keeps_preferences_and_reads_them_back() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = file_in(&directory, &PREFERENCES);
        let file = r#"{"theme":"light","dottedGrid":false,"reduceMotion":true}"#;

        write_kept(&path, &PREFERENCES, file).expect("saved");

        assert_eq!(read_kept(&path, &PREFERENCES), file);
        assert!(matches!(
            write_kept(&path, &PREFERENCES, r#"["light"]"#),
            Err(SaveError::NotWhole(_))
        ));
    }

    #[test]
    fn no_file_or_a_damaged_one_reads_as_empty() {
        let directory = tempfile::tempdir().expect("temp dir");
        for kept in [
            &SAVED_BACKGROUNDS,
            &BRAND_KITS,
            &PATTERN_COLORS,
            &PREFERENCES,
        ] {
            let path = file_in(&directory, kept);
            assert_eq!(read_kept(&path, kept), kept.empty);

            fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            fs::write(&path, "{not json").expect("write");
            assert_eq!(read_kept(&path, kept), kept.empty);
        }
    }

    #[test]
    fn the_empty_kinds_are_whole() {
        for kept in [
            &SAVED_BACKGROUNDS,
            &BRAND_KITS,
            &PATTERN_COLORS,
            &PREFERENCES,
        ] {
            assert!((kept.is_whole)(kept.empty));
        }
    }

    #[test]
    fn refuses_anything_of_the_wrong_shape() {
        let directory = tempfile::tempdir().expect("temp dir");
        let backgrounds = file_in(&directory, &SAVED_BACKGROUNDS);
        let kits = file_in(&directory, &BRAND_KITS);

        assert!(matches!(
            write_kept(&backgrounds, &SAVED_BACKGROUNDS, r#"{"id":1}"#),
            Err(SaveError::NotWhole(_))
        ));
        assert!(matches!(
            write_kept(&kits, &BRAND_KITS, r#"[{"id":"bk_1"}]"#),
            Err(SaveError::NotWhole(_))
        ));
        assert!(matches!(
            write_kept(&kits, &BRAND_KITS, r#"{"kits":"none"}"#),
            Err(SaveError::NotWhole(_))
        ));
        assert!(!backgrounds.exists());
        assert!(!kits.exists());
    }

    #[test]
    fn refuses_a_file_too_big_to_keep() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = file_in(&directory, &SAVED_BACKGROUNDS);
        let huge = format!("[\"{}\"]", "a".repeat(MAX_FILE_BYTES));

        assert!(matches!(
            write_kept(&path, &SAVED_BACKGROUNDS, &huge),
            Err(SaveError::TooBig(_))
        ));
    }
}
