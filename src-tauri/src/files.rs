//! Native file commands.
//!
//! Dialogs run here rather than in the webview, so the UI can never name a
//! path: it can only write to, or read from, a location the user just picked.

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use tauri::{
    AppHandle,
    ipc::{InvokeBody, Request, Response},
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// `.layer` files hold every picture a project uses, so they are legitimately
/// large. The cap only stops an arbitrary huge file being pulled into memory and
/// then across IPC.
const MAX_PROJECT_BYTES: u64 = 512 * 1024 * 1024;

const FILENAME_HEADER: &str = "x-layer-filename";

#[derive(Debug, thiserror::Error)]
enum FileError {
    #[error("This file is too large to open as a project.")]
    ProjectTooLarge,
    #[error("This file is empty, so it isn't a Layer project.")]
    EmptyProject,
    #[error("Layer can't use the location you picked.")]
    UnsupportedLocation,
    #[error("Layer can't export this file type.")]
    UnsupportedFormat,
    #[error("Something went wrong preparing this file.")]
    MalformedRequest,
    #[error("Something went wrong while handling this file.")]
    TaskFailed,
    #[error("Layer couldn't access this file: {0}")]
    Io(#[from] io::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ExportFormat {
    Png,
    Jpg,
    Webp,
    /// An animation, as H.264 video or a looping GIF.
    Mp4,
    Gif,
}

impl ExportFormat {
    fn from_filename(filename: &str) -> Result<Self, FileError> {
        let extension = Path::new(filename)
            .extension()
            .and_then(|extension| extension.to_str())
            .ok_or(FileError::UnsupportedFormat)?;

        match extension {
            "png" => Ok(Self::Png),
            "jpg" => Ok(Self::Jpg),
            "webp" => Ok(Self::Webp),
            "mp4" => Ok(Self::Mp4),
            "gif" => Ok(Self::Gif),
            _ => Err(FileError::UnsupportedFormat),
        }
    }

    fn filter(self) -> (&'static str, &'static [&'static str]) {
        match self {
            Self::Png => ("PNG image", &["png"]),
            Self::Jpg => ("JPG image", &["jpg", "jpeg"]),
            Self::Webp => ("WebP image", &["webp"]),
            Self::Mp4 => ("MP4 video", &["mp4"]),
            Self::Gif => ("GIF image", &["gif"]),
        }
    }
}

/// Reduces a name sent by the UI to its final component, so a suggested name
/// can't steer the save dialog into another directory.
fn base_name(suggested: &str) -> &str {
    Path::new(suggested)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("untitled")
}

fn pick_save_path(
    app: &AppHandle,
    suggested_name: &str,
    (filter_name, extensions): (&str, &[&str]),
) -> Result<Option<PathBuf>, FileError> {
    app.dialog()
        .file()
        .set_file_name(base_name(suggested_name))
        .add_filter(filter_name, extensions)
        .blocking_save_file()
        .map(|picked| {
            picked
                .into_path()
                .map_err(|_| FileError::UnsupportedLocation)
        })
        .transpose()
}

fn read_project(path: &Path) -> Result<Vec<u8>, FileError> {
    let length = fs::metadata(path)?.len();
    if length > MAX_PROJECT_BYTES {
        return Err(FileError::ProjectTooLarge);
    }
    if length == 0 {
        return Err(FileError::EmptyProject);
    }
    Ok(fs::read(path)?)
}

/// Runs a dialog-and-disk task off the async runtime, since both block, and
/// reports any failure to the user natively: the UI has no error surface yet.
async fn run_file_task<T, F>(app: AppHandle, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&AppHandle) -> Result<T, FileError> + Send + 'static,
{
    let handle = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || task(&handle))
        .await
        .unwrap_or(Err(FileError::TaskFailed));

    outcome.map_err(|error| {
        let message = error.to_string();
        show_error_dialog(&app, &message);
        message
    })
}

fn show_error_dialog(app: &AppHandle, message: &str) {
    app.dialog()
        .message(message)
        .title("Layer")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

/// For failures only the UI can spot, such as a project file that doesn't parse.
#[tauri::command]
pub fn show_error(app: AppHandle, message: String) {
    show_error_dialog(&app, &message);
}

/// Asks before something that can't be undone, such as starting a new design.
/// True if the user chose `go`.
#[tauri::command]
pub async fn confirm(app: AppHandle, message: String, go: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .message(message)
            .title("Layer")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(go, "Cancel".into()))
            .blocking_show()
    })
    .await
    .unwrap_or(false)
}

/// Takes the finished .layer file (a zip the UI builds) as a raw IPC body, with
/// the suggested name in a header, and writes it where the user picks.
#[tauri::command]
pub async fn save_project(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let parsed = parse_export_request(&request);

    run_file_task(app, move |app| {
        let (suggested_name, bytes) = parsed?;
        let filter: (&str, &[&str]) = ("Layer project", &["layer"]);
        if let Some(path) = pick_save_path(app, &suggested_name, filter)? {
            fs::write(path, bytes)?;
        }
        Ok(())
    })
    .await
}

/// Returns the chosen project's bytes, or none at all if the user cancelled.
/// Unpacking, parsing and version checks stay in the UI, shared with the web
/// build.
#[tauri::command]
pub async fn open_project(app: AppHandle) -> Result<Response, String> {
    run_file_task(app, |app| {
        let picked = app
            .dialog()
            .file()
            .add_filter("Layer project", &["layer", "laybel"])
            .blocking_pick_file();

        let Some(path) = picked else {
            return Ok(Response::new(Vec::new()));
        };
        let path = path
            .into_path()
            .map_err(|_| FileError::UnsupportedLocation)?;
        read_project(&path).map(Response::new)
    })
    .await
}

/// Takes the encoded image or animation as a raw IPC body: a 2× export or a video
/// is tens of megabytes, which would be slow to pass as a JSON-encoded data URL.
#[tauri::command]
pub async fn export_static(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let parsed = parse_export_request(&request);

    run_file_task(app, move |app| {
        let (filename, bytes) = parsed?;
        let format = ExportFormat::from_filename(&filename)?;
        if let Some(path) = pick_save_path(app, &filename, format.filter())? {
            fs::write(path, bytes)?;
        }
        Ok(())
    })
    .await
}

fn parse_export_request(request: &Request<'_>) -> Result<(String, Vec<u8>), FileError> {
    let filename = request
        .headers()
        .get(FILENAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(FileError::MalformedRequest)?;

    match request.body() {
        // Cloned because the request is borrowed from the IPC layer but the
        // bytes must outlive it on the blocking thread. One copy is negligible
        // next to encoding the image.
        InvokeBody::Raw(bytes) => Ok((filename.to_owned(), bytes.clone())),
        InvokeBody::Json(_) => Err(FileError::MalformedRequest),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_name_strips_directories() {
        assert_eq!(base_name("../../etc/passwd"), "passwd");
        assert_eq!(base_name("/tmp/design.png"), "design.png");
        assert_eq!(base_name("design.layer"), "design.layer");
    }

    #[test]
    fn base_name_falls_back_when_nothing_is_left() {
        assert_eq!(base_name(".."), "untitled");
        assert_eq!(base_name(""), "untitled");
    }

    #[test]
    fn export_format_accepts_only_known_extensions() {
        assert_eq!(
            ExportFormat::from_filename("a.png").ok(),
            Some(ExportFormat::Png)
        );
        assert_eq!(
            ExportFormat::from_filename("a.jpg").ok(),
            Some(ExportFormat::Jpg)
        );
        assert_eq!(
            ExportFormat::from_filename("a.webp").ok(),
            Some(ExportFormat::Webp)
        );
        assert_eq!(
            ExportFormat::from_filename("a.mp4").ok(),
            Some(ExportFormat::Mp4)
        );
        assert_eq!(
            ExportFormat::from_filename("a.gif").ok(),
            Some(ExportFormat::Gif)
        );
        assert!(ExportFormat::from_filename("a.exe").is_err());
        assert!(ExportFormat::from_filename("a.mov").is_err());
        assert!(ExportFormat::from_filename("noextension").is_err());
    }

    #[test]
    fn read_project_reports_a_missing_file() {
        let path = std::env::temp_dir().join("layer-test-does-not-exist.layer");
        assert!(matches!(read_project(&path), Err(FileError::Io(_))));
    }

    #[test]
    fn read_project_rejects_oversized_files_without_reading_them() {
        let path = std::env::temp_dir().join(format!("layer-test-big-{}", std::process::id()));
        // A sparse file: reports the length without allocating the disk space.
        let file = fs::File::create(&path).expect("create temp file");
        file.set_len(MAX_PROJECT_BYTES + 1).expect("size temp file");

        let result = read_project(&path);
        fs::remove_file(&path).expect("remove temp file");

        assert!(matches!(result, Err(FileError::ProjectTooLarge)));
    }

    #[test]
    fn read_project_returns_file_contents() {
        let path = std::env::temp_dir().join(format!("layer-test-ok-{}", std::process::id()));
        // A zip's first bytes, as a .layer file starts.
        fs::write(&path, b"PK\x03\x04rest").expect("write temp file");

        let result = read_project(&path);
        fs::remove_file(&path).expect("remove temp file");

        assert_eq!(result.ok().as_deref(), Some(&b"PK\x03\x04rest"[..]));
    }

    #[test]
    fn read_project_refuses_an_empty_file() {
        let path = std::env::temp_dir().join(format!("layer-test-empty-{}", std::process::id()));
        fs::write(&path, b"").expect("write temp file");

        let result = read_project(&path);
        fs::remove_file(&path).expect("remove temp file");

        assert!(matches!(result, Err(FileError::EmptyProject)));
    }
}
