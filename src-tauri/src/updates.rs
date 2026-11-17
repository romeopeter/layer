//! Layer's own updates. The app asks the address in `tauri.conf.json`
//! (`plugins.updater.endpoints`, Layer's GitHub releases) whether there's a newer
//! version, downloads it, checks its signature against the public key built into
//! the app, installs it and restarts. An update that isn't signed with Layer's
//! private key is refused. See learn/18-releases-and-updates.md.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

/// The update found by the last check, waiting to be installed.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

#[derive(Debug, thiserror::Error)]
enum UpdateError {
    // Nothing more is passed on: the error would name the address asked.
    #[error("Layer couldn't check for updates. Check your connection and try again.")]
    Unreachable,
    #[error("There's no update waiting to be installed. Check for updates again.")]
    Nothing,
    #[error("The update couldn't be installed. Try again later.")]
    InstallFailed,
}

/// Asks whether there's a newer Layer. Its version and notes if there is.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|_| UpdateError::Unreachable.to_string())?
        .check()
        .await
        .map_err(|_| UpdateError::Unreachable.to_string())?;
    let info = update.as_ref().map(|update| UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone(),
    });
    *pending
        .0
        .lock()
        .map_err(|_| UpdateError::Nothing.to_string())? = update;
    Ok(info)
}

/// Downloads and installs the update the last check found, telling the page how
/// far it's got (`update-progress`: bytes so far, and the total if known), then
/// restarts into it. Returns only if it couldn't.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .map_err(|_| UpdateError::Nothing.to_string())?
        .take()
        .ok_or_else(|| UpdateError::Nothing.to_string())?;
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit("update-progress", (downloaded, total));
            },
            || {},
        )
        .await
        .map_err(|_| UpdateError::InstallFailed.to_string())?;
    app.restart();
}
