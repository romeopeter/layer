//! HEIC and HEIF photos, the kind iPhones take, turned into a JPEG (or a PNG when
//! they have see-through parts) the rest of Layer can use. Decoded here so every
//! platform can import them: WebKit on macOS reads HEIC, but the webviews on
//! Windows and Linux don't. `zune-heic` is pure Rust with its own HEVC decoder (on
//! a Mac it uses Apple's hardware decoder), so there's no system codec to install.

use image::{
    ExtendedColorType, ImageEncoder,
    codecs::{jpeg::JpegEncoder, png::PngEncoder},
};
use tauri::ipc::{InvokeBody, Request, Response};
use zune_heic::{
    HeifDecoder,
    zune_core::{bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions},
};

/// Well above any phone's photo; stops a runaway file being read whole.
const MAX_FILE_BYTES: usize = 100 * 1024 * 1024;
/// A 200-megapixel sensor is under 17 000 px a side.
const MAX_SIDE: usize = 20_000;
/// High enough that re-encoding a photo shows nothing.
const JPEG_QUALITY: u8 = 92;

#[derive(Debug, thiserror::Error)]
enum HeicError {
    #[error("Something went wrong preparing this photo.")]
    Malformed,
    #[error("This photo is too large to open.")]
    TooBig,
    #[error(
        "Layer couldn't read this photo. It may be damaged, or a kind of HEIC Layer can't open."
    )]
    Unreadable,
}

fn options() -> DecoderOptions {
    DecoderOptions::default()
        .set_max_width(MAX_SIDE)
        .set_max_height(MAX_SIDE)
}

/// The photo's pixels, encoded as a JPEG, or a PNG if any of it is see-through.
fn convert(bytes: &[u8]) -> Result<Vec<u8>, HeicError> {
    convert_with(bytes, options())
}

fn convert_with(bytes: &[u8], options: DecoderOptions) -> Result<Vec<u8>, HeicError> {
    let mut decoder = HeifDecoder::new_with_options(ZCursor::new(bytes), options);
    let pixels = decoder.decode().map_err(|_| HeicError::Unreadable)?;
    let width = decoder.width().ok_or(HeicError::Unreadable)?;
    let height = decoder.height().ok_or(HeicError::Unreadable)?;
    let colorspace = decoder.colorspace().ok_or(HeicError::Unreadable)?;
    let (width, height) = (
        u32::try_from(width).map_err(|_| HeicError::TooBig)?,
        u32::try_from(height).map_err(|_| HeicError::TooBig)?,
    );

    let mut out = Vec::new();
    match colorspace {
        ColorSpace::RGB => jpeg(&mut out, &pixels, width, height, ExtendedColorType::Rgb8)?,
        ColorSpace::Luma => jpeg(&mut out, &pixels, width, height, ExtendedColorType::L8)?,
        ColorSpace::RGBA if pixels.chunks_exact(4).all(|pixel| pixel[3] == 255) => {
            // An alpha plane with nothing see-through in it: a photo, so a JPEG.
            let rgb: Vec<u8> = pixels
                .chunks_exact(4)
                .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
                .collect();
            jpeg(&mut out, &rgb, width, height, ExtendedColorType::Rgb8)?;
        }
        ColorSpace::RGBA => png(&mut out, &pixels, width, height, ExtendedColorType::Rgba8)?,
        ColorSpace::LumaA => png(&mut out, &pixels, width, height, ExtendedColorType::La8)?,
        _ => return Err(HeicError::Unreadable),
    }
    Ok(out)
}

fn jpeg(
    out: &mut Vec<u8>,
    pixels: &[u8],
    width: u32,
    height: u32,
    color: ExtendedColorType,
) -> Result<(), HeicError> {
    JpegEncoder::new_with_quality(out, JPEG_QUALITY)
        .write_image(pixels, width, height, color)
        .map_err(|_| HeicError::Unreadable)
}

fn png(
    out: &mut Vec<u8>,
    pixels: &[u8],
    width: u32,
    height: u32,
    color: ExtendedColorType,
) -> Result<(), HeicError> {
    PngEncoder::new(out)
        .write_image(pixels, width, height, color)
        .map_err(|_| HeicError::Unreadable)
}

/// A HEIC or HEIF photo, sent as a raw body, back as JPEG or PNG bytes.
#[tauri::command]
pub async fn convert_heic(request: Request<'_>) -> Result<Response, String> {
    let bytes = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        InvokeBody::Json(_) => return Err(HeicError::Malformed.to_string()),
    };
    if bytes.len() > MAX_FILE_BYTES {
        return Err(HeicError::TooBig.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || convert(&bytes))
        .await
        .map_err(|_| HeicError::Unreadable.to_string())?
        .map(Response::new)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test photos made with macOS's own encoder (`sips -s format heic`): the left
    /// half warm red, the right half blue.
    fn fixture(name: &str) -> Vec<u8> {
        std::fs::read(format!(
            "{}/../tests/fixtures/{name}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("fixture")
    }

    fn decoded(bytes: &[u8]) -> image::DynamicImage {
        image::load_from_memory(bytes).expect("an image")
    }

    fn close(a: [u8; 3], b: [u8; 3]) -> bool {
        a.iter().zip(b).all(|(x, y)| x.abs_diff(y) <= 12)
    }

    #[test]
    fn a_photo_becomes_a_jpeg_the_right_way_round() {
        let out = convert(&fixture("photo.heic")).expect("converted");
        assert_eq!(&out[..2], &[0xFF, 0xD8], "a JPEG");
        let image = decoded(&out).to_rgb8();
        assert_eq!(image.dimensions(), (64, 48));
        assert!(
            close(image.get_pixel(8, 24).0, [220, 40, 40]),
            "{:?}",
            image.get_pixel(8, 24)
        );
        assert!(
            close(image.get_pixel(56, 24).0, [40, 80, 220]),
            "{:?}",
            image.get_pixel(56, 24)
        );
    }

    #[test]
    fn a_photo_in_tiles_comes_out_whole() {
        let out = convert(&fixture("photo-grid.heic")).expect("converted");
        let image = decoded(&out).to_rgb8();
        assert_eq!(image.dimensions(), (1600, 1200));
        assert!(close(image.get_pixel(100, 1100).0, [220, 40, 40]));
        assert!(close(image.get_pixel(1500, 100).0, [40, 80, 220]));
    }

    /// Windows and Linux decode in software; on a Mac the tests above use Apple's
    /// hardware decoder, so this checks the software path gives the same picture.
    #[test]
    fn the_software_decoder_gives_the_same_photo() {
        for name in ["photo.heic", "photo-grid.heic"] {
            let out = convert_with(&fixture(name), options().hvec_set_use_videotoolbox(false))
                .expect("converted");
            let image = decoded(&out).to_rgb8();
            let (width, height) = image.dimensions();
            assert!(
                close(image.get_pixel(width / 8, height / 2).0, [220, 40, 40]),
                "{name}"
            );
            assert!(
                close(image.get_pixel(width * 7 / 8, height / 2).0, [40, 80, 220]),
                "{name}"
            );
        }
    }

    #[test]
    fn see_through_parts_stay_see_through() {
        let out = convert(&fixture("photo-alpha.heic")).expect("converted");
        assert_eq!(&out[..4], &[0x89, b'P', b'N', b'G'], "a PNG");
        let image = decoded(&out).to_rgba8();
        assert_eq!(image.get_pixel(8, 24).0[3], 255);
        assert!(image.get_pixel(56, 24).0[3] < 16);
    }

    #[test]
    fn anything_else_is_refused_plainly() {
        assert!(matches!(
            convert(b"not a photo"),
            Err(HeicError::Unreadable)
        ));
        assert!(matches!(
            convert(&fixture("solid.png")),
            Err(HeicError::Unreadable)
        ));
    }
}
