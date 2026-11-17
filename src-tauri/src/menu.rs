//! The menu bar. Most items are Layer's own actions: choosing one tells the page
//! (`menu` event, carrying the item's id), which does it exactly as its keyboard
//! shortcut would. Cut, Copy, Paste and the window items are the system's own, so
//! text fields and the clipboard behave as everywhere else.

use tauri::{
    AppHandle, Emitter, Manager, Runtime,
    menu::{
        AboutMetadataBuilder, CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder,
        MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
    },
};

/// The two items that show a setting, kept so the page can tick them as it changes.
pub struct MenuChecks<R: Runtime> {
    dark_mode: CheckMenuItem<R>,
    grid: CheckMenuItem<R>,
}

/// Builds the menu and the checks it holds.
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, MenuChecks<R>)> {
    let item = |id: &str, label: &str, accelerator: Option<&str>| {
        let builder = MenuItemBuilder::with_id(id, label);
        match accelerator {
            Some(keys) => builder.accelerator(keys).build(app),
            None => builder.build(app),
        }
    };

    let dark_mode = CheckMenuItemBuilder::with_id("dark-mode", "Dark Mode")
        .checked(true)
        .build(app)?;
    let grid = CheckMenuItemBuilder::with_id("grid", "Show Grid").build(app)?;

    let about = AboutMetadataBuilder::new()
        .name(Some("Layer"))
        .version(Some(app.package_info().version.to_string()))
        .build();
    let check_updates = item("check-updates", "Check for Updates…", None)?;
    let settings = item("settings", "Settings…", Some("CmdOrCtrl+Comma"))?;

    let file = SubmenuBuilder::new(app, "File")
        .item(&item("new", "New Design", Some("CmdOrCtrl+N"))?)
        .item(&item("open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&item("save", "Save…", Some("CmdOrCtrl+S"))?)
        .separator()
        .item(&item("export-png", "Export PNG", Some("CmdOrCtrl+E"))?)
        .item(&item("export", "Export…", Some("CmdOrCtrl+Shift+E"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?);
    #[cfg(not(target_os = "macos"))]
    let file = file
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?);

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&item("undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item("redo", "Redo", Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&item("duplicate", "Duplicate", Some("CmdOrCtrl+D"))?)
        .item(&item("delete", "Delete", None)?)
        .separator()
        .item(&item("select-all", "Select All", Some("CmdOrCtrl+A"))?);

    let view = SubmenuBuilder::new(app, "View")
        .item(&item("zoom-in", "Zoom In", Some("CmdOrCtrl+Equal"))?)
        .item(&item("zoom-out", "Zoom Out", Some("CmdOrCtrl+Minus"))?)
        .item(&item("zoom-fit", "Fit to Window", Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&grid)
        .item(&dark_mode)
        .separator()
        .item(&item("play", "Play Animation", None)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, None)?);

    let window = SubmenuBuilder::new(app, "Window")
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?);

    let help =
        SubmenuBuilder::new(app, "Help").item(&item("shortcuts", "Keyboard Shortcuts", None)?);
    #[cfg(not(target_os = "macos"))]
    let help = help
        .separator()
        .item(&check_updates)
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Layer"),
            Some(about.clone()),
        )?);

    let menu = MenuBuilder::new(app);
    // On macOS the first menu is the app's own, named after it.
    #[cfg(target_os = "macos")]
    let menu = menu.item(
        &SubmenuBuilder::new(app, "Layer")
            .item(&PredefinedMenuItem::about(
                app,
                Some("About Layer"),
                Some(about),
            )?)
            .item(&check_updates)
            .separator()
            .item(&settings)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?,
    );

    let menu = menu
        .item(&file.build()?)
        .item(&edit.build()?)
        .item(&view.build()?)
        .item(&window.build()?)
        .item(&help.build()?)
        .build()?;
    Ok((menu, MenuChecks { dark_mode, grid }))
}

/// Puts the menu on the app and passes Layer's own items to the page.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let (menu, checks) = build(app)?;
    app.set_menu(menu)?;
    app.manage(checks);
    app.on_menu_event(|app, event| {
        // The system's own items are handled by the system; everything else is Layer's.
        let _ = app.emit("menu", event.id().as_ref());
    });
    Ok(())
}

/// Ticks the items that show a setting, when the page changes it.
#[tauri::command]
pub fn sync_menu(app: AppHandle, dark_mode: bool, grid: bool) {
    if let Some(checks) = app.try_state::<MenuChecks<tauri::Wry>>() {
        let _ = checks.dark_mode.set_checked(dark_mode);
        let _ = checks.grid.set_checked(grid);
    }
}
