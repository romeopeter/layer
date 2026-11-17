//! A picture on the system clipboard, read natively. The webview's paste event
//! doesn't always carry one: some apps put only TIFF or other native formats on
//! the clipboard, which WebKit doesn't hand to the page. This reads whatever
//! image is there and gives it back as PNG.

use tauri::{AppHandle, ipc::Response};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Well past any screen; stops a runaway image being encoded and sent whole.
const MAX_SIDE: u32 = 16_384;

#[derive(Debug, thiserror::Error)]
enum ClipboardError {
    #[error("Layer couldn't read the picture on the clipboard.")]
    Unreadable,
    #[error("The picture on the clipboard is too large to paste.")]
    TooBig,
}

fn encode_png(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ClipboardError> {
    if width > MAX_SIDE || height > MAX_SIDE {
        return Err(ClipboardError::TooBig);
    }
    let expected = (width as usize) * (height as usize) * 4;
    if width == 0 || height == 0 || rgba.len() != expected {
        return Err(ClipboardError::Unreadable);
    }
    let mut out = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder
            .write_header()
            .map_err(|_| ClipboardError::Unreadable)?;
        writer
            .write_image_data(rgba)
            .map_err(|_| ClipboardError::Unreadable)?;
    }
    Ok(out)
}

/// The clipboard's picture as PNG bytes, or no bytes at all when there isn't one.
#[tauri::command]
pub async fn read_clipboard_image(app: AppHandle) -> Result<Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Text, files or nothing on the clipboard: not an error, just no picture.
        let Ok(image) = app.clipboard().read_image() else {
            return Ok(Vec::new());
        };
        encode_png(image.rgba(), image.width(), image.height())
    })
    .await
    .map_err(|_| ClipboardError::Unreadable.to_string())?
    .map(Response::new)
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_the_pixels_as_a_png_that_reads_back() {
        let rgba = [255, 0, 0, 255, 0, 255, 0, 128];
        let bytes = encode_png(&rgba, 2, 1).expect("encoded");
        let decoder = png::Decoder::new(std::io::Cursor::new(bytes));
        let mut reader = decoder.read_info().expect("a png");
        let mut pixels = vec![0; reader.output_buffer_size().expect("a size")];
        let info = reader.next_frame(&mut pixels).expect("a frame");
        assert_eq!((info.width, info.height), (2, 1));
        assert_eq!(&pixels[..info.buffer_size()], &rgba);
    }

    #[test]
    fn refuses_pixels_that_dont_fit_their_size() {
        assert!(matches!(
            encode_png(&[0; 4], 2, 2),
            Err(ClipboardError::Unreadable)
        ));
        assert!(matches!(
            encode_png(&[], 0, 0),
            Err(ClipboardError::Unreadable)
        ));
        assert!(matches!(
            encode_png(&[], MAX_SIDE + 1, 1),
            Err(ClipboardError::TooBig)
        ));
    }
}
