use tauri::Manager;

mod capture;
mod files;
mod fonts;
mod pixabay;
mod saved;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Layer");
}
