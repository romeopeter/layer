use tauri::Manager;

mod brand_assets;
mod capture;
mod clipboard;
mod files;
mod fonts;
mod pixabay;
mod saved;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Read from Rust only (clipboard.rs): the window's capabilities grant none of it.
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let cache_file = app
                .path()
                .app_cache_dir()
                .ok()
                .map(|directory| directory.join("pixabay-searches.json"));
            app.manage(pixabay::SearchCache::load(cache_file));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture::capture_screen,
            files::save_project,
            files::open_project,
            files::show_error,
            files::export_static,
            fonts::google_font,
            pixabay::search_images,
            pixabay::download_image,
            saved::load_saved_backgrounds,
            saved::store_saved_backgrounds,
            saved::load_brand_kits,
            saved::store_brand_kits,
            brand_assets::store_brand_asset,
            brand_assets::load_brand_asset,
            clipboard::read_clipboard_image,
            saved::load_pattern_colors,
            saved::store_pattern_colors,
            saved::load_preferences,
            saved::store_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Layer");
}
